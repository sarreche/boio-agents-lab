import { fakeModel } from "@langchain/core/testing";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { defineAgent } from "../../src/core/agent-definition.js";
import { StructuredOutputValidationError } from "../../src/core/errors.js";
import { ModelProviderRegistry } from "../../src/models/registry.js";
import { StaticModelProvider } from "../../src/models/static-model-provider.js";
import { DirectModelRuntime } from "../../src/runtime/direct-model-runtime.js";

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
      agentName: "test-agent",
      runId: "run-123",
      sessionId: "session-123",
      runtime: "direct-model",
      output: { value: "validated" },
      stepCount: 1,
      toolCalls: [],
      startedAt: "2026-09-11T12:00:00.000Z",
      completedAt: "2026-09-11T12:00:00.000Z",
    });
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
});
