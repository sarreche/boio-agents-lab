import { describe, expect, it, vi } from "vitest";

import { defineAgent } from "../../src/core/agent-definition.js";
import type { AgentRunRequest, StructuredAgent } from "../../src/core/agent-runtime.js";
import {
  SubagentAlreadyRegisteredError,
  SubagentDepthLimitError,
  SubagentNotAuthorizedError,
  SubagentNotRegisteredError,
} from "../../src/core/errors.js";
import { SubagentCoordinator } from "../../src/subagents/coordinator.js";
import { SubagentRegistry } from "../../src/subagents/registry.js";

const model = { provider: "openrouter", model: "fake", temperature: 0 } as const;

function definition(name: string, subagents: readonly string[] = [], maxSubagentDepth = 3) {
  return defineAgent({
    name,
    description: `${name} test agent`,
    systemPrompt: "Return a test result.",
    model,
    subagents: [...subagents],
    maxSubagentDepth,
  });
}

function childAgent(run: StructuredAgent<{ answer: string }>["run"]) {
  const agent: StructuredAgent<{ answer: string }> = {
    definition: definition("researcher"),
    run,
    resume: () => Promise.reject(new Error("Not used in this test.")),
  };
  return agent;
}

describe("SubagentRegistry", () => {
  it("rejects duplicates and unknown names", () => {
    const registry = new SubagentRegistry();
    const agent = childAgent(() => Promise.reject(new Error("Not invoked.")));
    registry.register(agent);

    expect(() => {
      registry.register(agent);
    }).toThrow(SubagentAlreadyRegisteredError);
    expect(() => registry.get("unknown")).toThrow(SubagentNotRegisteredError);
  });
});

describe("SubagentCoordinator", () => {
  it("starts an isolated child run and preserves lineage in the hand-off", async () => {
    const run = vi.fn((_request: AgentRunRequest) =>
      Promise.resolve({
        status: "completed" as const,
        agentName: "researcher",
        runId: "child-run-1",
        runtime: "fake-child",
        output: { answer: "Child result" },
        stepCount: 1,
        toolCalls: [],
        approvalDecisions: [],
        childRuns: [],
        startedAt: "2026-09-12T12:00:00.000Z",
        completedAt: "2026-09-12T12:00:01.000Z",
      }),
    );
    const registry = new SubagentRegistry();
    registry.register(childAgent(run));
    const coordinator = new SubagentCoordinator(registry);

    await expect(
      coordinator.delegate({
        parentDefinition: definition("supervisor", ["researcher"], 2),
        parentRunId: "parent-run",
        parentDepth: 0,
        inheritedMaxDepth: 2,
        agentName: "researcher",
        task: "Investigate state isolation.",
      }),
    ).resolves.toEqual({
      status: "completed",
      agentName: "researcher",
      parentRunId: "parent-run",
      childRunId: "child-run-1",
      depth: 1,
      output: { answer: "Child result" },
    });
    expect(run).toHaveBeenCalledWith({
      input: "Investigate state isolation.",
      metadata: {
        parentAgentName: "supervisor",
        parentRunId: "parent-run",
        delegationDepth: 1,
      },
      lineage: { parentRunId: "parent-run", depth: 1, maxDepth: 2 },
    });
  });

  it("denies undeclared children before registry lookup", async () => {
    const coordinator = new SubagentCoordinator(new SubagentRegistry());

    await expect(
      coordinator.delegate({
        parentDefinition: definition("supervisor"),
        parentRunId: "parent-run",
        parentDepth: 0,
        inheritedMaxDepth: 3,
        agentName: "secret-agent",
        task: "Unauthorized task",
      }),
    ).rejects.toBeInstanceOf(SubagentNotAuthorizedError);
  });

  it("enforces the strictest inherited or local depth ceiling", async () => {
    const run = vi.fn(() => Promise.reject(new Error("Must not run.")));
    const registry = new SubagentRegistry();
    registry.register(childAgent(run));
    const coordinator = new SubagentCoordinator(registry);

    await expect(
      coordinator.delegate({
        parentDefinition: definition("supervisor", ["researcher"], 3),
        parentRunId: "parent-run",
        parentDepth: 1,
        inheritedMaxDepth: 1,
        agentName: "researcher",
        task: "Too deep",
      }),
    ).rejects.toBeInstanceOf(SubagentDepthLimitError);
    await expect(
      coordinator.delegate({
        parentDefinition: definition("supervisor", ["researcher"], 0),
        parentRunId: "root-run",
        parentDepth: 0,
        inheritedMaxDepth: 3,
        agentName: "researcher",
        task: "Locally forbidden",
      }),
    ).rejects.toBeInstanceOf(SubagentDepthLimitError);
    expect(run).not.toHaveBeenCalled();
  });
});
