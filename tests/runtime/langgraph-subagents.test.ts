import { FakeToolCallingModel } from "langchain";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { defineAgent } from "../../src/core/agent-definition.js";
import { createStructuredAgent, type StructuredAgent } from "../../src/core/agent-runtime.js";
import { GraphConfigurationError } from "../../src/core/errors.js";
import { ModelProviderRegistry } from "../../src/models/registry.js";
import { StaticModelProvider } from "../../src/models/static-model-provider.js";
import { LangGraphRuntime } from "../../src/runtime/langgraph-runtime.js";
import { SubagentCoordinator } from "../../src/subagents/coordinator.js";
import { SubagentRegistry } from "../../src/subagents/registry.js";
import { ToolRegistry } from "../../src/tools/registry.js";

const modelConfig = { provider: "openrouter", model: "fake-supervisor", temperature: 0 } as const;
const outputSchema = z.object({ answer: z.string() });

function childAgent(run: StructuredAgent<{ finding: string }>["run"]) {
  return {
    definition: defineAgent({
      name: "researcher",
      description: "Researches an isolated task.",
      systemPrompt: "Return one finding.",
      model: modelConfig,
      tools: ["child_only_tool"],
    }),
    run,
    resume: () => Promise.reject(new Error("Not used in this test.")),
  } satisfies StructuredAgent<{ finding: string }>;
}

function parentDefinition() {
  return defineAgent({
    name: "supervisor",
    description: "Delegates specialist work.",
    systemPrompt: "Delegate research, then synthesize its structured result.",
    model: modelConfig,
    subagents: ["researcher"],
    maxSteps: 3,
    maxSubagentDepth: 2,
  });
}

describe("LangGraphRuntime subagent delegation", () => {
  it("delegates through a named node and stores a structured child-run result", async () => {
    const childRun = vi.fn(() =>
      Promise.resolve({
        status: "completed" as const,
        agentName: "researcher",
        runId: "child-run-1",
        runtime: "fake-child",
        output: { finding: "Context stayed isolated." },
        stepCount: 1,
        toolCalls: [],
        approvalDecisions: [],
        childRuns: [],
        startedAt: "2026-09-12T12:00:00.000Z",
        completedAt: "2026-09-12T12:00:01.000Z",
      }),
    );
    const registry = new SubagentRegistry();
    registry.register(childAgent(childRun));
    const parentModel = new FakeToolCallingModel({
      toolCalls: [
        [
          {
            name: "delegate_agent",
            args: { agentName: "researcher", task: "Study context isolation." },
            id: "delegate-1",
          },
        ],
        [{ name: "supervisor_output", args: { answer: "Isolation confirmed." }, id: "output-1" }],
      ],
    });
    const runtime = new LangGraphRuntime({
      providers: new ModelProviderRegistry([new StaticModelProvider("openrouter", parentModel)]),
      tools: new ToolRegistry(),
      subagents: new SubagentCoordinator(registry),
      createRunId: () => "parent-run-1",
      now: () => new Date("2026-09-12T12:00:00.000Z"),
    });
    const supervisor = createStructuredAgent({
      definition: parentDefinition(),
      outputSchema,
      runtime,
    });

    const result = await supervisor.run({ input: "Explain context isolation." });

    expect(result.status).toBe("completed");
    if (result.status !== "completed") {
      throw new Error("Expected supervisor to finish after delegation.");
    }
    expect(result.output).toEqual({ answer: "Isolation confirmed." });
    expect(result.childRuns).toEqual([
      {
        status: "completed",
        agentName: "researcher",
        parentRunId: "parent-run-1",
        childRunId: "child-run-1",
        depth: 1,
        output: { finding: "Context stayed isolated." },
      },
    ]);
    expect(result.toolCalls).toEqual([
      {
        name: "delegate_agent",
        callId: "delegate-1",
        arguments: { agentName: "researcher", task: "Study context isolation." },
      },
    ]);
    expect(childRun).toHaveBeenCalledWith(
      expect.objectContaining({
        input: "Study context isolation.",
        lineage: { parentRunId: "parent-run-1", depth: 1, maxDepth: 2 },
      }),
    );
  });

  it("requires an explicit coordinator for declared subagents", async () => {
    const runtime = new LangGraphRuntime({
      providers: new ModelProviderRegistry([
        new StaticModelProvider("openrouter", new FakeToolCallingModel()),
      ]),
      tools: new ToolRegistry(),
    });
    const supervisor = createStructuredAgent({
      definition: parentDefinition(),
      outputSchema,
      runtime,
    });

    await expect(supervisor.run({ input: "Delegate this." })).rejects.toBeInstanceOf(
      GraphConfigurationError,
    );
  });

  it("returns a child failure to the supervisor as a recoverable tool result", async () => {
    const childRun = vi.fn(() => Promise.reject(new Error("Child provider unavailable.")));
    const registry = new SubagentRegistry();
    registry.register(childAgent(childRun));
    const parentModel = new FakeToolCallingModel({
      toolCalls: [
        [
          {
            name: "delegate_agent",
            args: { agentName: "researcher", task: "Try the child." },
            id: "delegate-failure",
          },
        ],
        [
          {
            name: "supervisor_output",
            args: { answer: "The specialist was unavailable." },
            id: "output-after-failure",
          },
        ],
      ],
    });
    const supervisor = createStructuredAgent({
      definition: parentDefinition(),
      outputSchema,
      runtime: new LangGraphRuntime({
        providers: new ModelProviderRegistry([new StaticModelProvider("openrouter", parentModel)]),
        tools: new ToolRegistry(),
        subagents: new SubagentCoordinator(registry),
      }),
    });

    const result = await supervisor.run({ input: "Handle child failure." });

    expect(result.status).toBe("completed");
    if (result.status !== "completed") {
      throw new Error("Expected the supervisor to recover from child failure.");
    }
    expect(result.output).toEqual({ answer: "The specialist was unavailable." });
    expect(result.childRuns).toEqual([]);
    expect(result.toolCalls).toMatchObject([{ name: "delegate_agent" }]);
    expect(childRun).toHaveBeenCalledOnce();
  });
});
