import { fakeModel } from "@langchain/core/testing";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { defineAgent } from "../../src/core/agent-definition.js";
import { createStructuredAgent } from "../../src/core/agent-runtime.js";
import {
  AgentApprovalNotSupportedError,
  AgentResumeNotSupportedError,
  StructuredOutputValidationError,
} from "../../src/core/errors.js";
import { ModelProviderRegistry } from "../../src/models/registry.js";
import { StaticModelProvider } from "../../src/models/static-model-provider.js";
import { DirectModelRuntime } from "../../src/runtime/direct-model-runtime.js";
import type { Tracer } from "../../src/observability/tracer.js";

const definition = defineAgent({
  name: "test-agent",
  description: "Exercises the direct runtime",
  systemPrompt: "Return the requested object.",
  model: { provider: "openrouter", model: "fake-model", temperature: 0 },
  maxSteps: 1,
});

const outputSchema = z.object({ value: z.string().min(1) });

describe("DirectModelRuntime", () => {
  it("validates structured output and returns execution metadata", async () => {
    const model = fakeModel().structuredResponse({ value: "validated" });
    const runtime = new DirectModelRuntime({
      providers: new ModelProviderRegistry([new StaticModelProvider("openrouter", model)]),
      createRunId: () => "run-123",
      now: () => new Date("2026-09-11T12:00:00.000Z"),
    });

    const result = await runtime.runStructured({
      definition,
      outputSchema,
      request: { input: "Return a value", sessionId: "session-123" },
    });

    expect(result).toEqual({
      status: "completed",
      agentName: "test-agent",
      runId: "run-123",
      sessionId: "session-123",
      runtime: "direct-model",
      output: { value: "validated" },
      stepCount: 1,
      toolCalls: [],
      approvalDecisions: [],
      childRuns: [],
      startedAt: "2026-09-11T12:00:00.000Z",
      completedAt: "2026-09-11T12:00:00.000Z",
    });
  });

  it("nests a generation observation inside the agent run", async () => {
    const observations: string[] = [];
    const tracer: Tracer = {
      async observe(spec, operation) {
        observations.push(`start:${spec.type}`);
        const result = await operation({ update: () => undefined });
        observations.push(`end:${spec.type}`);
        return result;
      },
    };
    const runtime = new DirectModelRuntime({
      providers: new ModelProviderRegistry([
        new StaticModelProvider("openrouter", fakeModel().structuredResponse({ value: "ok" })),
      ]),
      tracer,
    });

    await runtime.runStructured({ definition, outputSchema, request: { input: "Return a value" } });

    expect(observations).toEqual([
      "start:agent",
      "start:generation",
      "end:generation",
      "end:agent",
    ]);
  });

  it("rejects malformed structured output even when a provider accepts it", async () => {
    const model = fakeModel().structuredResponse({ value: "" });
    const runtime = new DirectModelRuntime({
      providers: new ModelProviderRegistry([new StaticModelProvider("openrouter", model)]),
    });

    await expect(
      runtime.runStructured({ definition, outputSchema, request: { input: "Return a value" } }),
    ).rejects.toBeInstanceOf(StructuredOutputValidationError);
  });

  it("rejects resume when the selected runtime has no checkpoint support", async () => {
    const runtime = new DirectModelRuntime({
      providers: new ModelProviderRegistry([
        new StaticModelProvider("openrouter", fakeModel().structuredResponse({ value: "unused" })),
      ]),
    });
    const agent = createStructuredAgent({ definition, outputSchema, runtime });

    await expect(
      agent.resume({ sessionId: "session-123", value: { decision: "approve" } }),
    ).rejects.toBeInstanceOf(AgentResumeNotSupportedError);
  });

  it("does not silently ignore an approval policy it cannot enforce", async () => {
    const runtime = new DirectModelRuntime({
      providers: new ModelProviderRegistry([
        new StaticModelProvider("openrouter", fakeModel().structuredResponse({ value: "unused" })),
      ]),
    });

    await expect(
      runtime.runStructured({
        definition: { ...definition, tools: ["effect"], approvalRequiredTools: ["effect"] },
        outputSchema,
        request: { input: "Do not bypass approval." },
      }),
    ).rejects.toBeInstanceOf(AgentApprovalNotSupportedError);
  });

  it("does not silently ignore a delegation policy it cannot enforce", async () => {
    const runtime = new DirectModelRuntime({
      providers: new ModelProviderRegistry([
        new StaticModelProvider("openrouter", fakeModel().structuredResponse({ value: "unused" })),
      ]),
    });

    await expect(
      runtime.runStructured({
        definition: { ...definition, subagents: ["researcher"] },
        outputSchema,
        request: { input: "Delegate this task." },
      }),
    ).rejects.toThrow('Runtime "direct-model" does not support subagent delegation.');
  });
});
