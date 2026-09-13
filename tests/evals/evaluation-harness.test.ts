import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { AgentRunResult } from "../../src/core/agent-runtime.js";
import { EvaluationConfigurationError } from "../../src/core/errors.js";
import { defineEvaluationDataset } from "../../src/evals/dataset.js";
import {
  createCostEvaluator,
  createExpectedToolsEvaluator,
  createForbiddenToolsEvaluator,
  createLatencyEvaluator,
  createMaxStepsEvaluator,
  createRequiredFieldsEvaluator,
  createSchemaEvaluator,
} from "../../src/evals/deterministic/index.js";
import { createLlmJudgeEvaluator } from "../../src/evals/llm-judge.js";
import { runEvaluation } from "../../src/evals/runner.js";

const outputSchema = z.object({ answer: z.string().min(1) });
type Output = z.output<typeof outputSchema>;

function completedResult(toolNames: readonly string[] = []): AgentRunResult<Output> {
  return {
    status: "completed",
    agentName: "fake-agent",
    runId: "run-1",
    runtime: "fake",
    output: { answer: "Grounded answer" },
    stepCount: 2,
    toolCalls: toolNames.map((name, index) => ({ name, callId: String(index), arguments: {} })),
    approvalDecisions: [],
    childRuns: [],
    startedAt: "2026-09-12T12:00:00.000Z",
    completedAt: "2026-09-12T12:00:00.010Z",
  };
}

const dataset = defineEvaluationDataset({
  name: "offline-baseline",
  version: "1.0.0",
  cases: [
    {
      id: "case-1",
      input: "Research this.",
      expected: { answerContains: "Grounded" },
      expectedBehavior: "Return a grounded answer.",
      expectedTools: ["mock_search"],
      forbiddenTools: ["filesystem_write"],
      tags: ["offline"],
    },
  ],
});

function firstCase() {
  const evaluationCase = dataset.cases[0];
  if (evaluationCase === undefined)
    throw new Error("Expected the dataset fixture to contain a case.");
  return evaluationCase;
}

describe("evaluation harness", () => {
  it("runs deterministic evaluators and aggregates metrics", async () => {
    const times = [100, 112];
    const tracedTypes: string[] = [];
    const report = await runEvaluation({
      dataset,
      agent: { run: () => Promise.resolve(completedResult(["mock_search"])) },
      evaluators: [
        createSchemaEvaluator(outputSchema),
        createRequiredFieldsEvaluator<Output>(["answer"]),
        createExpectedToolsEvaluator(),
        createForbiddenToolsEvaluator(),
        createMaxStepsEvaluator(3),
        createLatencyEvaluator(20),
        createCostEvaluator(0.01),
      ],
      now: () => times.shift() ?? 112,
      tracer: {
        async observe(spec, operation) {
          tracedTypes.push(spec.type);
          return operation({ update: () => undefined });
        },
      },
      extractMetrics: () => ({
        tokenUsage: { input: 10, output: 5, total: 15 },
        costUsd: 0.005,
      }),
    });

    expect(report.cases[0]).toMatchObject({ status: "passed", metrics: { latencyMs: 12 } });
    expect(report.summary).toMatchObject({
      passRate: 1,
      averageScore: 1,
      totalTokenUsage: { input: 10, output: 5, total: 15 },
      totalCostUsd: 0.005,
    });
    expect(tracedTypes).toEqual(Array.from({ length: 7 }, () => "evaluator"));
  });

  it("keeps execution and evaluator failures visible", async () => {
    const report = await runEvaluation<Output>({
      dataset,
      agent: { run: () => Promise.reject(new Error("provider unavailable")) },
      evaluators: [
        {
          name: "broken-judge",
          evaluate: () => Promise.reject(new Error("judge unavailable")),
        },
      ],
    });

    expect(report.cases[0]?.status).toBe("error");
    expect(report.cases[0]?.failures).toMatchObject([
      { stage: "execution", message: "Error: provider unavailable" },
      { stage: "evaluator", evaluator: "broken-judge", message: "Error: judge unavailable" },
    ]);
    expect(report.summary.errorCases).toBe(1);
  });

  it("marks a deterministic tool-policy violation as failed", async () => {
    const report = await runEvaluation({
      dataset,
      agent: { run: () => Promise.resolve(completedResult(["filesystem_write"])) },
      evaluators: [createExpectedToolsEvaluator(), createForbiddenToolsEvaluator()],
    });

    expect(report.cases[0]?.status).toBe("failed");
    expect(report.cases[0]?.scores).toMatchObject([
      { evaluator: "expected-tools", passed: false },
      { evaluator: "forbidden-tools", passed: false },
    ]);
  });

  it("validates and scores a structured fake LLM judge result", async () => {
    const judge = createLlmJudgeEvaluator<Output>({
      model: {
        judge: () =>
          Promise.resolve({
            correctness: 4,
            completeness: 3,
            relevance: 4,
            groundedness: 3,
            rationale: "The answer is relevant and grounded.",
          }),
      },
      passThreshold: 0.8,
    });

    const score = await judge.evaluate({
      case: firstCase(),
      outcome: completedResult(),
      metrics: { latencyMs: 1 },
    });

    expect(score).toMatchObject({ evaluator: "llm-judge", passed: true, score: 0.875 });
  });

  it("does not turn an invalid judge response into a quality score", async () => {
    const judge = createLlmJudgeEvaluator<Output>({
      model: { judge: () => Promise.resolve({ correctness: 4 }) },
    });

    await expect(
      judge.evaluate({
        case: firstCase(),
        outcome: completedResult(),
        metrics: { latencyMs: 1 },
      }),
    ).rejects.toThrow("invalid structured result");
  });

  it("rejects duplicate dataset case identifiers", () => {
    expect(() =>
      defineEvaluationDataset({
        name: "duplicates",
        version: "1",
        cases: [
          { id: "same", input: "one", expectedTools: [], forbiddenTools: [], tags: [] },
          { id: "same", input: "two", expectedTools: [], forbiddenTools: [], tags: [] },
        ],
      }),
    ).toThrow(EvaluationConfigurationError);
  });

  it("rejects an empty evaluator list instead of reporting a vacuous pass", async () => {
    await expect(
      runEvaluation({
        dataset,
        agent: { run: () => Promise.resolve(completedResult()) },
        evaluators: [],
      }),
    ).rejects.toBeInstanceOf(EvaluationConfigurationError);
  });

  it("reports a malformed custom evaluator score as an evaluator error", async () => {
    const report = await runEvaluation({
      dataset,
      agent: { run: () => Promise.resolve(completedResult()) },
      evaluators: [
        {
          name: "invalid-score",
          evaluate: () => Promise.resolve({ evaluator: "invalid-score", passed: true, score: 2 }),
        },
      ],
    });

    expect(report.cases[0]).toMatchObject({
      status: "error",
      failures: [{ stage: "evaluator", evaluator: "invalid-score" }],
    });
  });
});
