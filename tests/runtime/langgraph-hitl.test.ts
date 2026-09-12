import { FakeToolCallingModel } from "langchain";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { defineAgent } from "../../src/core/agent-definition.js";
import { createStructuredAgent } from "../../src/core/agent-runtime.js";
import {
  AgentSessionAlreadyExistsError,
  AgentSessionMismatchError,
  AgentSessionNotFoundError,
  AgentSessionNotInterruptedError,
  SessionIdRequiredError,
} from "../../src/core/errors.js";
import { toolApprovalInterruptSchema } from "../../src/graph/state.js";
import { ModelProviderRegistry } from "../../src/models/registry.js";
import { StaticModelProvider } from "../../src/models/static-model-provider.js";
import { LangGraphRuntime } from "../../src/runtime/langgraph-runtime.js";
import { ToolRegistry } from "../../src/tools/registry.js";
import { defineTool } from "../../src/tools/tool.js";

const outputSchema = z.object({ message: z.string() });
const modelConfig = { provider: "openrouter", model: "fake-tool-model", temperature: 0 } as const;

function createHarness() {
  let effectCount = 0;
  const publishDraft = defineTool({
    name: "publish_draft",
    description: "Publishes a draft after explicit human approval.",
    inputSchema: z.object({ text: z.string().min(1) }),
    outputSchema: z.object({ published: z.boolean() }),
    execute: () => {
      effectCount += 1;
      return { published: true };
    },
  });
  const model = new FakeToolCallingModel({
    toolCalls: [
      [{ name: "publish_draft", args: { text: "hello" }, id: "publish-1" }],
      [{ name: "publisher_output", args: { message: "Review handled." }, id: "output-1" }],
    ],
  });
  const runtime = new LangGraphRuntime({
    providers: new ModelProviderRegistry([new StaticModelProvider("openrouter", model)]),
    tools: new ToolRegistry([publishDraft]),
    createRunId: () => "approval-run",
    now: () => new Date("2026-09-12T12:00:00.000Z"),
  });
  const definition = defineAgent({
    name: "publisher",
    description: "Exercises checkpointed human approval.",
    systemPrompt: "Publish the supplied draft, then return structured output.",
    model: modelConfig,
    tools: ["publish_draft"],
    approvalRequiredTools: ["publish_draft"],
    maxSteps: 3,
  });

  return {
    agent: createStructuredAgent({ definition, outputSchema, runtime }),
    definition,
    effectCount: () => effectCount,
    runtime,
  };
}

describe("LangGraphRuntime human-in-the-loop", () => {
  it("pauses before an effect and resumes the same run after approval", async () => {
    const harness = createHarness();

    const paused = await harness.agent.run({ input: "Publish hello.", sessionId: "session-1" });

    expect(paused.status).toBe("interrupted");
    if (paused.status !== "interrupted") {
      throw new Error("Expected the guarded tool call to interrupt.");
    }
    expect(harness.effectCount()).toBe(0);
    expect(paused.runId).toBe("approval-run");
    expect(toolApprovalInterruptSchema.parse(paused.interrupts[0]?.value)).toMatchObject({
      kind: "tool-approval",
      sessionId: "session-1",
      toolCalls: [{ name: "publish_draft", callId: "publish-1" }],
    });

    const completed = await harness.agent.resume({
      sessionId: "session-1",
      value: { decision: "approve", actor: "reviewer" },
    });

    expect(completed.status).toBe("completed");
    if (completed.status !== "completed") {
      throw new Error("Expected the approved run to complete.");
    }
    expect(harness.effectCount()).toBe(1);
    expect(completed.runId).toBe(paused.runId);
    expect(completed.output).toEqual({ message: "Review handled." });
    expect(completed.approvalDecisions).toEqual([
      {
        decision: "approve",
        actor: "reviewer",
        decidedAt: "2026-09-12T12:00:00.000Z",
        toolCallIds: ["publish-1"],
      },
    ]);
  });

  it("records rejection and lets the model finish without invoking the tool", async () => {
    const harness = createHarness();
    await harness.agent.run({ input: "Publish hello.", sessionId: "session-reject" });

    const completed = await harness.agent.resume({
      sessionId: "session-reject",
      value: { decision: "reject", actor: "reviewer", reason: "Needs editing" },
    });

    expect(completed.status).toBe("completed");
    if (completed.status !== "completed") {
      throw new Error("Expected the rejected run to reach structured output.");
    }
    expect(harness.effectCount()).toBe(0);
    expect(completed.toolCalls).toEqual([
      { name: "publish_draft", callId: "publish-1", arguments: { text: "hello" } },
    ]);
    expect(completed.approvalDecisions[0]).toMatchObject({
      decision: "reject",
      actor: "reviewer",
      reason: "Needs editing",
    });
  });

  it("interrupts again with validation feedback for a malformed decision", async () => {
    const harness = createHarness();
    await harness.agent.run({ input: "Publish hello.", sessionId: "session-invalid" });

    const pausedAgain = await harness.agent.resume({
      sessionId: "session-invalid",
      value: { decision: "maybe", actor: "" },
    });

    expect(pausedAgain.status).toBe("interrupted");
    if (pausedAgain.status !== "interrupted") {
      throw new Error("Expected invalid approval input to interrupt again.");
    }
    expect(harness.effectCount()).toBe(0);
    expect(
      toolApprovalInterruptSchema.parse(pausedAgain.interrupts[0]?.value).validationErrors,
    ).not.toHaveLength(0);

    const completed = await harness.agent.resume({
      sessionId: "session-invalid",
      value: { decision: "reject", actor: "reviewer" },
    });
    expect(completed.status).toBe("completed");
  });

  it("enforces explicit session lifecycle boundaries", async () => {
    const harness = createHarness();

    await expect(harness.agent.run({ input: "Publish without a session." })).rejects.toBeInstanceOf(
      SessionIdRequiredError,
    );
    await expect(
      harness.agent.resume({
        sessionId: "unknown-session",
        value: { decision: "approve", actor: "reviewer" },
      }),
    ).rejects.toBeInstanceOf(AgentSessionNotFoundError);

    await harness.agent.run({ input: "Publish hello.", sessionId: "session-lifecycle" });
    await expect(
      harness.agent.run({ input: "Start over.", sessionId: "session-lifecycle" }),
    ).rejects.toBeInstanceOf(AgentSessionAlreadyExistsError);

    await harness.agent.resume({
      sessionId: "session-lifecycle",
      value: { decision: "reject", actor: "reviewer" },
    });
    await expect(
      harness.agent.resume({
        sessionId: "session-lifecycle",
        value: { decision: "approve", actor: "reviewer" },
      }),
    ).rejects.toBeInstanceOf(AgentSessionNotInterruptedError);
  });

  it("prevents a different agent definition from taking over a session", async () => {
    const harness = createHarness();
    await harness.agent.run({ input: "Publish hello.", sessionId: "owned-session" });
    const otherAgent = createStructuredAgent({
      definition: defineAgent({
        ...harness.definition,
        name: "other-publisher",
      }),
      outputSchema,
      runtime: harness.runtime,
    });

    await expect(
      otherAgent.resume({
        sessionId: "owned-session",
        value: { decision: "approve", actor: "reviewer" },
      }),
    ).rejects.toBeInstanceOf(AgentSessionMismatchError);
    expect(harness.effectCount()).toBe(0);
  });
});
