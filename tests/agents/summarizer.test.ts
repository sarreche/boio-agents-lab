import { fakeModel } from "@langchain/core/testing";
import { describe, expect, it } from "vitest";

import { createSummarizer } from "../../src/agents/summarizer.js";
import { ModelProviderRegistry } from "../../src/models/registry.js";
import { StaticModelProvider } from "../../src/models/static-model-provider.js";
import { DirectModelRuntime } from "../../src/runtime/direct-model-runtime.js";

describe("summarizer", () => {
  it("returns the promised summary shape without network access", async () => {
    const model = fakeModel().structuredResponse({
      summary: "The source describes explicit agent architecture.",
      keyPoints: ["State is visible", "Infrastructure is replaceable"],
    });
    const runtime = new DirectModelRuntime({
      providers: new ModelProviderRegistry([new StaticModelProvider("openrouter", model)]),
    });
    const summarizer = createSummarizer({
      model: { provider: "openrouter", model: "fake-model", temperature: 0 },
      runtime,
    });

    const result = await summarizer.run({
      input: "State is visible and infrastructure is replaceable.",
    });

    expect(result.output).toEqual({
      summary: "The source describes explicit agent architecture.",
      keyPoints: ["State is visible", "Infrastructure is replaceable"],
    });
    expect(result.stepCount).toBe(1);
    expect(summarizer.definition.tools).toEqual([]);
  });
});
