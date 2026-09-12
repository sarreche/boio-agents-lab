import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SandboxViolationError, ToolExecutionError } from "../../src/core/errors.js";
import { createSandboxedFileTools } from "../../src/tools/builtins/sandboxed-files.js";
import { ToolRegistry } from "../../src/tools/registry.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function createRegistry(maxFileBytes = 128) {
  const root = await mkdtemp(join(tmpdir(), "miniagents-files-"));
  temporaryRoots.push(root);
  return {
    registry: new ToolRegistry(createSandboxedFileTools({ rootDirectory: root, maxFileBytes })),
    root,
  };
}

describe("sandboxed file tools", () => {
  it("writes and reads UTF-8 files inside the configured root", async () => {
    const { registry } = await createRegistry();
    const authorizedTools = ["write_file", "read_file"];

    await expect(
      registry.execute({
        name: "write_file",
        input: { path: "notes/result.txt", content: "grounded result" },
        authorizedTools,
      }),
    ).resolves.toMatchObject({ path: "notes/result.txt", created: true });

    await expect(
      registry.execute({
        name: "read_file",
        input: { path: "notes/result.txt" },
        authorizedTools,
      }),
    ).resolves.toEqual({ path: "notes/result.txt", content: "grounded result", bytes: 15 });
  });

  it("blocks lexical path traversal", async () => {
    const { registry } = await createRegistry();

    await expect(
      registry.execute({
        name: "write_file",
        input: { path: "../escape.txt", content: "blocked" },
        authorizedTools: ["write_file"],
      }),
    ).rejects.toBeInstanceOf(SandboxViolationError);
  });

  it("blocks absolute paths", async () => {
    const { registry, root } = await createRegistry();

    await expect(
      registry.execute({
        name: "write_file",
        input: { path: join(root, "escape.txt"), content: "blocked" },
        authorizedTools: ["write_file"],
      }),
    ).rejects.toBeInstanceOf(SandboxViolationError);
  });

  it("enforces size limits for reads and writes", async () => {
    const { registry, root } = await createRegistry(4);
    await writeFile(join(root, "large.txt"), "12345", "utf8");

    await expect(
      registry.execute({
        name: "read_file",
        input: { path: "large.txt" },
        authorizedTools: ["read_file"],
      }),
    ).rejects.toBeInstanceOf(SandboxViolationError);
    await expect(
      registry.execute({
        name: "write_file",
        input: { path: "new.txt", content: "12345" },
        authorizedTools: ["write_file"],
      }),
    ).rejects.toBeInstanceOf(SandboxViolationError);
  });

  it("rejects directories as file targets", async () => {
    const { registry, root } = await createRegistry();
    await mkdir(join(root, "folder"));

    await expect(
      registry.execute({
        name: "read_file",
        input: { path: "folder" },
        authorizedTools: ["read_file"],
      }),
    ).rejects.toBeInstanceOf(SandboxViolationError);
    await expect(
      registry.execute({
        name: "write_file",
        input: { path: "folder", content: "blocked", overwrite: true },
        authorizedTools: ["write_file"],
      }),
    ).rejects.toBeInstanceOf(SandboxViolationError);
  });

  it("does not overwrite existing files unless explicitly requested", async () => {
    const { registry } = await createRegistry();
    const request = {
      name: "write_file",
      input: { path: "result.txt", content: "first" },
      authorizedTools: ["write_file"],
    } as const;

    await registry.execute(request);
    await expect(registry.execute(request)).rejects.toBeInstanceOf(ToolExecutionError);
    await expect(
      registry.execute({
        ...request,
        input: { ...request.input, content: "second", overwrite: true },
      }),
    ).resolves.toMatchObject({ created: false });
  });
});
