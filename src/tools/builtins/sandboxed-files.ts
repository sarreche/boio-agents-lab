import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { z } from "zod";

import { SandboxViolationError } from "../../core/errors.js";
import { defineTool, type RegisteredTool } from "../tool.js";

export interface SandboxedFileToolOptions {
  rootDirectory: string;
  maxFileBytes?: number;
}

function isPathInside(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return (
    relativePath === "" ||
    (relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath))
  );
}

function resolveLexicalPath(root: string, requestedPath: string): string {
  if (isAbsolute(requestedPath)) {
    throw new SandboxViolationError("Absolute paths are not allowed in sandboxed file tools.");
  }

  const candidate = resolve(root, requestedPath);
  if (!isPathInside(root, candidate)) {
    throw new SandboxViolationError("The requested path escapes the configured sandbox root.");
  }
  return candidate;
}

async function getExistingStats(path: string) {
  try {
    return await lstat(path);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw cause;
  }
}

async function prepareRoot(rootDirectory: string): Promise<string> {
  await mkdir(rootDirectory, { recursive: true });
  return realpath(rootDirectory);
}

async function ensureSafeParent(root: string, parent: string): Promise<void> {
  const relativeParent = relative(root, parent);
  const segments = relativeParent === "" ? [] : relativeParent.split(sep);
  let current = root;

  for (const segment of segments) {
    current = join(current, segment);
    const stats = await getExistingStats(current);
    if (stats?.isSymbolicLink() === true) {
      throw new SandboxViolationError("Symbolic links are not allowed in sandboxed paths.");
    }
    if (stats !== undefined && !stats.isDirectory()) {
      throw new SandboxViolationError("A sandbox path component is not a directory.");
    }
    if (stats === undefined) {
      await mkdir(current);
    }
  }

  const realParent = await realpath(parent);
  if (!isPathInside(root, realParent)) {
    throw new SandboxViolationError("The resolved parent path escapes the sandbox root.");
  }
}

export function createSandboxedFileTools(
  options: SandboxedFileToolOptions,
): readonly [RegisteredTool, RegisteredTool] {
  const configuredRoot = resolve(options.rootDirectory);
  const maxFileBytes = options.maxFileBytes ?? 1_048_576;
  const portablePath = (path: string) => path.split(sep).join("/");

  const readFileTool = defineTool({
    name: "read_file",
    description: "Read a UTF-8 text file located inside the configured sandbox root.",
    inputSchema: z.object({ path: z.string().min(1) }),
    outputSchema: z.object({
      path: z.string(),
      content: z.string(),
      bytes: z.number().int().nonnegative(),
    }),
    execute: async ({ path }) => {
      const root = await prepareRoot(configuredRoot);
      const candidate = resolveLexicalPath(root, path);
      const realCandidate = await realpath(candidate);
      if (!isPathInside(root, realCandidate)) {
        throw new SandboxViolationError("The resolved file path escapes the sandbox root.");
      }

      const stats = await lstat(realCandidate);
      if (stats.isSymbolicLink() || !stats.isFile()) {
        throw new SandboxViolationError("Only regular files can be read.");
      }
      if (stats.size > maxFileBytes) {
        throw new SandboxViolationError(
          `File exceeds the ${String(maxFileBytes)} byte sandbox limit.`,
        );
      }

      return {
        path: portablePath(relative(root, realCandidate)),
        content: await readFile(realCandidate, "utf8"),
        bytes: stats.size,
      };
    },
  });

  const writeFileTool = defineTool({
    name: "write_file",
    description: "Write a UTF-8 text file inside the configured sandbox root.",
    inputSchema: z.object({
      path: z.string().min(1),
      content: z.string(),
      overwrite: z.boolean().default(false),
    }),
    outputSchema: z.object({
      path: z.string(),
      bytes: z.number().int().nonnegative(),
      created: z.boolean(),
    }),
    execute: async ({ path, content, overwrite }, context) => {
      if (context.signal.aborted) {
        throw context.signal.reason;
      }

      const bytes = Buffer.byteLength(content, "utf8");
      if (bytes > maxFileBytes) {
        throw new SandboxViolationError(
          `Content exceeds the ${String(maxFileBytes)} byte sandbox limit.`,
        );
      }

      const root = await prepareRoot(configuredRoot);
      const candidate = resolveLexicalPath(root, path);
      await ensureSafeParent(root, dirname(candidate));

      const existingStats = await getExistingStats(candidate);
      if (existingStats?.isSymbolicLink() === true) {
        throw new SandboxViolationError("Symbolic links are not valid write targets.");
      }
      if (existingStats !== undefined && !existingStats.isFile()) {
        throw new SandboxViolationError("Only regular files can be overwritten.");
      }

      await writeFile(candidate, content, { encoding: "utf8", flag: overwrite ? "w" : "wx" });
      return {
        path: portablePath(relative(root, candidate)),
        bytes,
        created: existingStats === undefined,
      };
    },
  });

  return [readFileTool, writeFileTool];
}
