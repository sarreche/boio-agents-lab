import { describe, expect, it } from "vitest";

import type { AgentRunResult } from "../../src/core/agent-runtime.js";
import { RegressionThresholdError } from "../../src/core/errors.js";
import { researchDataset } from "../../src/evals/datasets/research-dataset.js";
import {
  createExpectedToolsEvaluator,
  createForbiddenToolsEvaluator,
  createMaxStepsEvaluator,
} from "../../src/evals/deterministic/index.js";
import { assertRegressionThresholds } from "../../src/evals/regression.js";
import { runEvaluation } from "../../src/evals/runner.js";
import type { ResearcherOutput } from "../../src/agents/researcher.js";

function fakeResearcher(input: string): AgentRunResult<ResearcherOutput> {
  const needsResearch = input.startsWith("Research");
  return {
    status: "completed",
    agentName: "researcher",
    runId: `run-${needsResearch ? "search" : "direct"}`,
    runtime: "fake",
    output: {
      answer: needsResearch ? "Explicit state makes decisions inspectable." : "Yes, it is blue.",
      sources: needsResearch ? [{ title: "Agent state", url: "https://example.test/state" }] : [],
      researchPerformed: needsResearch,
    },
    stepCount: needsResearch ? 2 : 1,
    toolCalls: needsResearch ? [{ name: "mock_search", callId: "search-1", arguments: {} }] : [],
    approvalDecisions: [],
    childRuns: [],
    startedAt: "2026-09-12T12:00:00.000Z",
    completedAt: "2026-09-12T12:00:00.001Z",
  };
}

describe("researcher regression baseline", () => {
  it("passes the committed offline quality gate", async () => {
    const report = await runEvaluation({
      dataset: researchDataset,
      agent: { run: ({ input }) => Promise.resolve(fakeResearcher(input)) },
      evaluators: [
        createExpectedToolsEvaluator(),
        createForbiddenToolsEvaluator(),
        createMaxStepsEvaluator(3),
      ],
    });

    expect(() => {
      assertRegressionThresholds(report, {
        minimumPassRate: 1,
        minimumAverageScore: 1,
        maximumErrorRate: 0,
        minimumEvaluatorScores: { "expected-tools": 1, "forbidden-tools": 1 },
      });
    }).not.toThrow();
  });

  it("throws a typed error when a threshold regresses", async () => {
    const report = await runEvaluation({
      dataset: researchDataset,
      agent: { run: ({ input }) => Promise.resolve(fakeResearcher(input)) },
      evaluators: [createExpectedToolsEvaluator()],
    });

    expect(() => {
      assertRegressionThresholds(report, {
        minimumPassRate: 1,
        minimumAverageScore: 1,
        minimumEvaluatorScores: { missing: 1 },
      });
    }).toThrow(RegressionThresholdError);
  });
});
