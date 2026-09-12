import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  InvalidToolArgumentsError,
  InvalidToolDefinitionError,
  InvalidToolOutputError,
  ToolAlreadyRegisteredError,
  ToolNotAuthorizedError,
  ToolNotRegisteredError,
  ToolTimeoutError,
} from "../../src/core/errors.js";
import { ToolRegistry } from "../../src/tools/registry.js";
import { defineTool } from "../../src/tools/tool.js";

const echoTool = defineTool({
  name: "echo",
  description: "Echo validated text.",
  inputSchema: z.object({ text: z.string().min(1) }),
  outputSchema: z.object({ text: z.string().min(1) }),
  execute: ({ text }) => ({ text }),
});

describe("ToolRegistry", () => {
  it("executes an explicitly authorized tool", async () => {
    const registry = new ToolRegistry([echoTool]);

    await expect(
      registry.execute({ name: "echo", input: { text: "hello" }, authorizedTools: ["echo"] }),
    ).resolves.toEqual({ text: "hello" });
  });

  it("denies a registered tool that is absent from the agent allowlist", async () => {
    const registry = new ToolRegistry([echoTool]);

    await expect(
      registry.execute({ name: "echo", input: { text: "hello" }, authorizedTools: [] }),
    ).rejects.toBeInstanceOf(ToolNotAuthorizedError);
  });

  it("rejects a tool that was never registered", async () => {
    const registry = new ToolRegistry();

    await expect(
      registry.execute({ name: "missing", input: {}, authorizedTools: ["missing"] }),
    ).rejects.toBeInstanceOf(ToolNotRegisteredError);
  });

  it("validates model-produced arguments", async () => {
    const registry = new ToolRegistry([echoTool]);

    await expect(
      registry.execute({ name: "echo", input: { text: "" }, authorizedTools: ["echo"] }),
    ).rejects.toBeInstanceOf(InvalidToolArgumentsError);
  });

  it("validates tool-produced output", async () => {
    const invalidTool = defineTool({
      name: "invalid_output",
      description: "Returns an invalid fixture.",
      inputSchema: z.object({}),
      outputSchema: z.object({ value: z.string().min(1) }),
      execute: () => ({ value: "" }),
    });
    const registry = new ToolRegistry([invalidTool]);

    await expect(
      registry.execute({ name: "invalid_output", input: {}, authorizedTools: ["invalid_output"] }),
    ).rejects.toBeInstanceOf(InvalidToolOutputError);
  });

  it("rejects duplicate registration", () => {
    const registry = new ToolRegistry([echoTool]);

    expect(() => {
      registry.register(echoTool);
    }).toThrow(ToolAlreadyRegisteredError);
  });

  it("rejects provider-incompatible tool names", () => {
    expect(() =>
      defineTool({
        name: "Bad Tool Name",
        description: "Invalid fixture.",
        inputSchema: z.object({}),
        outputSchema: z.object({ ok: z.boolean() }),
        execute: () => ({ ok: true }),
      }),
    ).toThrow(InvalidToolDefinitionError);
  });

  it("rejects empty tool descriptions", () => {
    expect(() =>
      defineTool({
        name: "valid_name",
        description: "   ",
        inputSchema: z.object({}),
        outputSchema: z.object({ ok: z.boolean() }),
        execute: () => ({ ok: true }),
      }),
    ).toThrow(InvalidToolDefinitionError);
  });

  it("adapts only authorized tools for LangChain", () => {
    const registry = new ToolRegistry([echoTool]);

    expect(registry.toLangChainTools(["echo"], { runId: "run-1" })).toHaveLength(1);
    expect(() => registry.toLangChainTools(["missing"], { runId: "run-1" })).toThrow(
      ToolNotRegisteredError,
    );
  });

  it("aborts execution at the configured timeout", async () => {
    const slowTool = defineTool({
      name: "slow",
      description: "Waits until aborted.",
      inputSchema: z.object({}),
      outputSchema: z.object({ done: z.boolean() }),
      execute: async (_input, context) => {
        await new Promise<void>((_resolve, reject) => {
          context.signal.addEventListener("abort", () => {
            reject(new Error("Tool execution aborted."));
          });
        });
        return { done: true };
      },
    });
    const registry = new ToolRegistry([slowTool], { defaultTimeoutMs: 5 });

    await expect(
      registry.execute({ name: "slow", input: {}, authorizedTools: ["slow"] }),
    ).rejects.toBeInstanceOf(ToolTimeoutError);
  });
});
