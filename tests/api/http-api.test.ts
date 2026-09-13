import { describe, expect, it } from "vitest";

import { HttpAgentRegistry } from "../../src/api/agent-registry.js";
import { createHttpApi } from "../../src/api/http-api.js";
import { InMemoryApiRunStore } from "../../src/api/run-store.js";
import type {
  AgentInterruptedResult,
  AgentRunRequest,
  AgentRunResult,
  StructuredAgent,
} from "../../src/core/agent-runtime.js";
import { AgentSessionAlreadyExistsError } from "../../src/core/errors.js";
import { defineAgent } from "../../src/core/agent-definition.js";

interface TestOutput extends Record<string, unknown> {
  message: string;
}

const definition = defineAgent({
  name: "test-agent",
  description: "A deterministic HTTP API fixture.",
  systemPrompt: "Return a test result.",
  model: { provider: "openrouter", model: "fake", temperature: 0 },
});

function completedResult(request: AgentRunRequest): AgentRunResult<TestOutput> {
  return {
    status: "completed",
    agentName: definition.name,
    runId: "run-1",
    ...(request.sessionId === undefined ? {} : { sessionId: request.sessionId }),
    runtime: "test",
    output: { message: request.input },
    stepCount: 1,
    toolCalls: [],
    approvalDecisions: [],
    childRuns: [],
    startedAt: "2026-09-13T10:00:00.000Z",
    completedAt: "2026-09-13T10:00:01.000Z",
  };
}

function interruptedResult(sessionId: string): AgentInterruptedResult {
  return {
    status: "interrupted",
    agentName: definition.name,
    runId: "run-paused",
    sessionId,
    runtime: "test",
    interrupts: [{ id: "approval-1", value: { kind: "tool-approval" } }],
    stepCount: 1,
    toolCalls: [],
    approvalDecisions: [],
    childRuns: [],
    startedAt: "2026-09-13T10:00:00.000Z",
    interruptedAt: "2026-09-13T10:00:01.000Z",
  };
}

function createTestAgent(): StructuredAgent<TestOutput> {
  return {
    definition,
    run: (request) =>
      Promise.resolve(
        request.input === "pause"
          ? interruptedResult(request.sessionId ?? "missing-session")
          : completedResult(request),
      ),
    resume: (request) =>
      Promise.resolve({
        ...completedResult({ input: "resumed", sessionId: request.sessionId }),
        runId: "run-paused",
      }),
  };
}

describe("HTTP API", () => {
  it("runs an allowlisted agent and exposes the recorded run", async () => {
    const agents = new HttpAgentRegistry().register(createTestAgent());
    const app = createHttpApi({
      agents,
      runStore: new InMemoryApiRunStore({
        now: () => new Date("2026-09-13T10:00:02.000Z"),
      }),
    });

    const runResponse = await app.inject({
      method: "POST",
      url: "/agents/test-agent/run",
      payload: { input: "hello", sessionId: "session-1", metadata: { source: "test" } },
    });
    expect(runResponse.statusCode).toBe(200);
    expect(runResponse.json()).toMatchObject({
      status: "completed",
      runId: "run-1",
      output: { message: "hello" },
    });

    const lookupResponse = await app.inject({ method: "GET", url: "/runs/run-1" });
    expect(lookupResponse.statusCode).toBe(200);
    expect(lookupResponse.json()).toMatchObject({
      runId: "run-1",
      agentName: "test-agent",
      sessionId: "session-1",
      status: "completed",
      createdAt: "2026-09-13T10:00:02.000Z",
      outcome: { output: { message: "hello" } },
    });

    await app.close();
  });

  it("returns 202 for an interrupt and updates session lookup after resume", async () => {
    const app = createHttpApi({ agents: new HttpAgentRegistry().register(createTestAgent()) });

    const paused = await app.inject({
      method: "POST",
      url: "/agents/test-agent/run",
      payload: { input: "pause", sessionId: "approval-session" },
    });
    expect(paused.statusCode).toBe(202);
    expect(paused.json()).toMatchObject({ status: "interrupted", runId: "run-paused" });

    const interruptedSession = await app.inject({
      method: "GET",
      url: "/sessions/approval-session",
    });
    expect(interruptedSession.json()).toMatchObject({
      sessionId: "approval-session",
      runId: "run-paused",
      status: "interrupted",
    });

    const resumed = await app.inject({
      method: "POST",
      url: "/agents/test-agent/resume",
      payload: {
        sessionId: "approval-session",
        value: { decision: "approve", actor: "reviewer" },
      },
    });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json()).toMatchObject({ status: "completed", runId: "run-paused" });

    const completedSession = await app.inject({
      method: "GET",
      url: "/sessions/approval-session",
    });
    expect(completedSession.json()).toMatchObject({ status: "completed" });

    await app.close();
  });

  it("rejects malformed input and unknown resources with stable error bodies", async () => {
    const app = createHttpApi({ agents: new HttpAgentRegistry().register(createTestAgent()) });

    const invalid = await app.inject({
      method: "POST",
      url: "/agents/test-agent/run",
      payload: { input: "" },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ error: { code: "INVALID_REQUEST" } });

    const unknownAgent = await app.inject({
      method: "POST",
      url: "/agents/unknown/run",
      payload: { input: "hello" },
    });
    expect(unknownAgent.statusCode).toBe(404);
    expect(unknownAgent.json()).toMatchObject({ error: { code: "NOT_FOUND" } });

    const unknownRun = await app.inject({ method: "GET", url: "/runs/unknown" });
    expect(unknownRun.statusCode).toBe(404);
    expect(unknownRun.json()).toMatchObject({ error: { code: "NOT_FOUND" } });

    await app.close();
  });

  it("maps session lifecycle errors to conflict responses", async () => {
    const conflictingAgent: StructuredAgent<TestOutput> = {
      ...createTestAgent(),
      run: () => Promise.reject(new AgentSessionAlreadyExistsError("existing-session")),
    };
    const app = createHttpApi({
      agents: new HttpAgentRegistry().register(conflictingAgent),
    });

    const response = await app.inject({
      method: "POST",
      url: "/agents/test-agent/run",
      payload: { input: "again", sessionId: "existing-session" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: {
        code: "SESSION_CONFLICT",
        message:
          'Session "existing-session" already has a checkpoint. Resume it or choose a new sessionId.',
      },
    });

    await app.close();
  });
});
