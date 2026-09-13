import { FakeToolCallingModel } from "langchain";
import { describe, expect, it } from "vitest";

import { createResearcher } from "../../src/agents/researcher.js";
import { researchDataset } from "../../src/evals/datasets/research-dataset.js";
import {
  createExpectedToolsEvaluator,
  createForbiddenToolsEvaluator,
  createMaxStepsEvaluator,
} from "../../src/evals/deterministic/index.js";
import { runEvaluation } from "../../src/evals/runner.js";
import { ModelProviderRegistry } from "../../src/models/registry.js";
import { StaticModelProvider } from "../../src/models/static-model-provider.js";
import { DeepAgentsRuntime } from "../../src/runtime/deep-agents-runtime.js";
import { LangGraphRuntime } from "../../src/runtime/langgraph-runtime.js";
import { createMockSearchTool } from "../../src/tools/builtins/mock-search.js";
import { ToolRegistry } from "../../src/tools/registry.js";

const modelConfig = {
  provider: "openrouter",
  model: "fake-runtime-comparison",
  temperature: 0,
} as const;

const researchedOutput = {
  answer: "Explicit state makes decisions inspectable.",
  sources: [{ title: "Agent state", url: "https://example.test/state" }],
  researchPerformed: true,
};

const directOutput = {
  answer: "Yes, the supplied description says the sky is blue.",
  sources: [],
  researchPerformed: false,
};

function createScriptedModel() {
  return new FakeToolCallingModel({
    toolCalls: [
      [{ name: "mock_search", args: { query: "explicit agent state debugging" }, id: "search-1" }],
      [{ name: "researcher_output", args: researchedOutput, id: "output-1" }],
      [{ name: "researcher_output", args: directOutput, id: "output-2" }],
    ],
  });
}

function createDependencies(model: FakeToolCallingModel) {
  return {
    providers: new ModelProviderRegistry([new StaticModelProvider("openrouter", model)]),
    tools: new ToolRegistry([
      createMockSearchTool([
        {
          title: "Agent state",
          url: "https://example.test/state",
          content: "Explicit state makes decisions and transitions inspectable.",
        },
      ]),
    ]),
  };
}

describe("runtime comparison", () => {
  it("executes the same researcher dataset against explicit and harness runtimes", async () => {
    const langGraphModel = createScriptedModel();
    const deepAgentsModel = createScriptedModel();
    const evaluators = [
      createExpectedToolsEvaluator(),
      createForbiddenToolsEvaluator(),
      createMaxStepsEvaluator(6),
    ];
    const langGraphAgent = createResearcher({
      model: modelConfig,
      runtime: new LangGraphRuntime(createDependencies(langGraphModel)),
    });
    const deepAgentsAgent = createResearcher({
      model: modelConfig,
      runtime: new DeepAgentsRuntime(createDependencies(deepAgentsModel)),
    });

    const [langGraphReport, deepAgentsReport] = await Promise.all([
      runEvaluation({ dataset: researchDataset, agent: langGraphAgent, evaluators }),
      runEvaluation({ dataset: researchDataset, agent: deepAgentsAgent, evaluators }),
    ]);

    expect(langGraphReport.summary).toMatchObject({
      totalCases: 2,
      passRate: 1,
      averageScore: 1,
    });
    expect(deepAgentsReport.summary).toMatchObject({
      totalCases: 2,
      passRate: 1,
      averageScore: 1,
    });
    expect(deepAgentsReport.summary.evaluatorScores).toEqual(
      langGraphReport.summary.evaluatorScores,
    );
    expect(langGraphReport.cases.map((item) => item.outcome?.runtime)).toEqual([
      "langgraph-explicit",
      "langgraph-explicit",
    ]);
    expect(deepAgentsReport.cases.map((item) => item.outcome?.runtime)).toEqual([
      "deep-agents",
      "deep-agents",
    ]);
  });
});
