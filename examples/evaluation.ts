import type { ResearcherOutput } from "../src/agents/researcher.js";
import type { AgentRunResult } from "../src/core/agent-runtime.js";
import { researchDataset } from "../src/evals/datasets/research-dataset.js";
import {
  createExpectedToolsEvaluator,
  createForbiddenToolsEvaluator,
  createMaxStepsEvaluator,
} from "../src/evals/deterministic/index.js";
import { assertRegressionThresholds } from "../src/evals/regression.js";
import { runEvaluation } from "../src/evals/runner.js";

function runOfflineResearcher(input: string): AgentRunResult<ResearcherOutput> {
  const researchPerformed = input.startsWith("Research");
  return {
    status: "completed",
    agentName: "researcher",
    runId: `example-${researchPerformed ? "search" : "direct"}`,
    runtime: "offline-evaluation-fixture",
    output: {
      answer: researchPerformed
        ? "Explicit state exposes decisions and transitions."
        : "The supplied statement describes the sky as blue.",
      sources: researchPerformed
        ? [{ title: "Agent state", url: "https://example.test/agent-state" }]
        : [],
      researchPerformed,
    },
    stepCount: researchPerformed ? 2 : 1,
    toolCalls: researchPerformed
      ? [{ name: "mock_search", callId: "search-1", arguments: {} }]
      : [],
    approvalDecisions: [],
    childRuns: [],
    startedAt: "2026-09-12T12:00:00.000Z",
    completedAt: "2026-09-12T12:00:00.001Z",
  };
}

const report = await runEvaluation({
  dataset: researchDataset,
  agent: { run: ({ input }) => Promise.resolve(runOfflineResearcher(input)) },
  evaluators: [
    createExpectedToolsEvaluator(),
    createForbiddenToolsEvaluator(),
    createMaxStepsEvaluator(3),
  ],
});

assertRegressionThresholds(report, {
  minimumPassRate: 1,
  minimumAverageScore: 1,
  maximumErrorRate: 0,
});

console.info(JSON.stringify(report.summary, null, 2));
