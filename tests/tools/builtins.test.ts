import { describe, expect, it } from "vitest";

import { ToolExecutionError } from "../../src/core/errors.js";
import { createCalculatorTool } from "../../src/tools/builtins/calculator.js";
import { createCurrentTimeTool } from "../../src/tools/builtins/current-time.js";
import { createMockSearchTool } from "../../src/tools/builtins/mock-search.js";
import { ToolRegistry } from "../../src/tools/registry.js";

describe("built-in tools", () => {
  it("calculates without arbitrary expression evaluation", async () => {
    const registry = new ToolRegistry([createCalculatorTool()]);

    await expect(
      registry.execute({
        name: "calculator",
        input: { operation: "multiply", operands: [6, 7] },
        authorizedTools: ["calculator"],
      }),
    ).resolves.toEqual({ result: 42 });
  });

  it.each([
    ["add", [10, 5, 2], 17],
    ["subtract", [10, 5, 2], 3],
    ["divide", [84, 2, 3], 14],
  ] as const)("supports the %s operation", async (operation, operands, expected) => {
    const registry = new ToolRegistry([createCalculatorTool()]);

    await expect(
      registry.execute({
        name: "calculator",
        input: { operation, operands: [...operands] },
        authorizedTools: ["calculator"],
      }),
    ).resolves.toEqual({ result: expected });
  });

  it("requires two operands for non-commutative operations", async () => {
    const registry = new ToolRegistry([createCalculatorTool()]);

    await expect(
      registry.execute({
        name: "calculator",
        input: { operation: "subtract", operands: [1] },
        authorizedTools: ["calculator"],
      }),
    ).rejects.toBeInstanceOf(ToolExecutionError);
  });

  it("rejects division by zero explicitly", async () => {
    const registry = new ToolRegistry([createCalculatorTool()]);

    await expect(
      registry.execute({
        name: "calculator",
        input: { operation: "divide", operands: [1, 0] },
        authorizedTools: ["calculator"],
      }),
    ).rejects.toBeInstanceOf(ToolExecutionError);
  });

  it("uses an injected clock for deterministic time", async () => {
    const registry = new ToolRegistry([
      createCurrentTimeTool({ now: () => new Date("2026-09-11T15:00:00.000Z") }),
    ]);

    await expect(
      registry.execute({
        name: "current_time",
        input: { timezone: "UTC" },
        authorizedTools: ["current_time"],
      }),
    ).resolves.toMatchObject({ iso: "2026-09-11T15:00:00.000Z", timezone: "UTC" });
  });

  it("rejects an invalid IANA timezone", async () => {
    const registry = new ToolRegistry([createCurrentTimeTool()]);

    await expect(
      registry.execute({
        name: "current_time",
        input: { timezone: "Mars/Olympus_Mons" },
        authorizedTools: ["current_time"],
      }),
    ).rejects.toBeInstanceOf(ToolExecutionError);
  });

  it("searches a deterministic corpus and ranks matching documents", async () => {
    const registry = new ToolRegistry([
      createMockSearchTool([
        {
          title: "Agent state",
          url: "https://example.test/agent-state",
          content: "Explicit agent state enables inspection and checkpoints.",
        },
        {
          title: "Cooking notes",
          url: "https://example.test/cooking",
          content: "A recipe collection.",
        },
      ]),
    ]);

    await expect(
      registry.execute({
        name: "mock_search",
        input: { query: "explicit agent state" },
        authorizedTools: ["mock_search"],
      }),
    ).resolves.toMatchObject({
      results: [{ title: "Agent state", url: "https://example.test/agent-state" }],
    });
  });

  it("returns an empty result for an unrelated search", async () => {
    const registry = new ToolRegistry([createMockSearchTool([])]);

    await expect(
      registry.execute({
        name: "mock_search",
        input: { query: "unrelated" },
        authorizedTools: ["mock_search"],
      }),
    ).resolves.toEqual({ query: "unrelated", results: [] });
  });
});
