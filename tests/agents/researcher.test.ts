import { FakeToolCallingModel } from "langchain";
import { describe, expect, it } from "vitest";

import { createResearcher, researcherOutputSchema } from "../../src/agents/researcher.js";
import { AgentApprovalNotSupportedError } from "../../src/core/errors.js";
import { ModelProviderRegistry } from "../../src/models/registry.js";
import { StaticModelProvider } from "../../src/models/static-model-provider.js";
import { ToolCallingRuntime } from "../../src/runtime/tool-calling-runtime.js";
import { createMockSearchTool } from "../../src/tools/builtins/mock-search.js";
import { ToolRegistry } from "../../src/tools/registry.js";

const researchOutput = {
  answer: "Explicit state makes agent execution inspectable.",
  sources: [{ title: "Agent state", url: "https://example.test/agent-state" }],
  researchPerformed: true,
};

function createRuntime(model: FakeToolCallingModel) {
  return new ToolCallingRuntime({
    providers: new ModelProviderRegistry([new StaticModelProvider("openrouter", model)]),
    tools: new ToolRegistry([
      createMockSearchTool([
        {
          title: "Agent state",
          url: "https://example.test/agent-state",
          content: "Explicit state makes agent execution inspectable and checkpointable.",
        },
      ]),
    ]),
    createRunId: () => "research-run",
    now: () => new Date("2026-09-11T15:00:00.000Z"),
  });
}

describe("researcher", () => {
  it("can decide to search and then return structured research", async () => {
    const model = new FakeToolCallingModel({
      toolCalls: [
        [
          {
            name: "mock_search",
            args: { query: "explicit agent state", limit: 3 },
            id: "search-1",
          },
        ],
        [{ name: "researcher_output", args: researchOutput, id: "output-1" }],
      ],
    });
    const researcher = createResearcher({
      model: { provider: "openrouter", model: "fake-tool-model", temperature: 0 },
      runtime: createRuntime(model),
    });

    const result = await researcher.run({ input: "Why is explicit agent state useful?" });

    expect(result.status).toBe("completed");
    if (result.status !== "completed") {
      throw new Error("Expected the researcher run to complete.");
    }
    expect(result.output).toEqual(researchOutput);
    expect(result.toolCalls).toEqual([
      {
        name: "mock_search",
        callId: "search-1",
        arguments: { query: "explicit agent state", limit: 3 },
      },
    ]);
    expect(result.stepCount).toBe(2);
  });

  it("can finish without searching when the prompt contains the answer", async () => {
    const directOutput = {
      answer: "The supplied value is 42.",
      sources: [],
      researchPerformed: false,
    };
    const model = new FakeToolCallingModel({
      toolCalls: [[{ name: "researcher_output", args: directOutput, id: "output-1" }]],
    });
    const researcher = createResearcher({
      model: { provider: "openrouter", model: "fake-tool-model", temperature: 0 },
      runtime: createRuntime(model),
    });

    const result = await researcher.run({ input: "Using only this prompt: the value is 42." });

    expect(result.status).toBe("completed");
    if (result.status !== "completed") {
      throw new Error("Expected the researcher run to complete.");
    }
    expect(result.output).toEqual(directOutput);
    expect(result.toolCalls).toEqual([]);
  });

  it("does not let the high-level runtime bypass a guarded tool policy", async () => {
    const model = new FakeToolCallingModel({ toolCalls: [] });
    const runtime = createRuntime(model);
    const researcher = createResearcher({
      model: { provider: "openrouter", model: "fake-tool-model", temperature: 0 },
      runtime,
    });

    await expect(
      runtime.runStructured({
        definition: { ...researcher.definition, approvalRequiredTools: ["mock_search"] },
        outputSchema: researcherOutputSchema,
        request: { input: "Search only after approval." },
      }),
    ).rejects.toBeInstanceOf(AgentApprovalNotSupportedError);
  });
});
