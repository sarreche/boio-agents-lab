import type { AgentRunOutcome, StructuredAgent } from "../core/agent-runtime.js";
import { EvaluationConfigurationError, EvaluatorExecutionError } from "../core/errors.js";
import { NoopTracer } from "../observability/noop-tracer.js";
import type { Tracer } from "../observability/tracer.js";
import type { EvaluationDataset } from "./dataset.js";
import {
  evaluationScoreSchema,
  type EvaluationMetrics,
  type EvaluationScore,
  type Evaluator,
} from "./evaluator.js";

export interface EvaluationFailure {
  stage: "execution" | "evaluator";
  evaluator?: string;
  message: string;
}

export interface EvaluationCaseResult<TOutput extends Record<string, unknown>> {
  caseId: string;
  status: "passed" | "failed" | "error";
  outcome?: AgentRunOutcome<TOutput>;
  scores: readonly EvaluationScore[];
  metrics: EvaluationMetrics;
  failures: readonly EvaluationFailure[];
}

export interface EvaluationSummary {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  errorCases: number;
  passRate: number;
  averageScore: number;
  averageLatencyMs: number;
  totalTokenUsage?: { input: number; output: number; total: number };
  totalCostUsd?: number;
  evaluatorScores: Readonly<Record<string, number>>;
}

export interface EvaluationReport<TOutput extends Record<string, unknown>> {
  dataset: { name: string; version: string };
  cases: readonly EvaluationCaseResult<TOutput>[];
  summary: EvaluationSummary;
}

export interface EvaluationRunnerOptions<TOutput extends Record<string, unknown>, TExpected> {
  dataset: EvaluationDataset<TExpected>;
  agent: Pick<StructuredAgent<TOutput>, "run">;
  evaluators: readonly Evaluator<TOutput, TExpected>[];
  now?: () => number;
  tracer?: Tracer;
  extractMetrics?: (
    outcome: AgentRunOutcome<TOutput>,
  ) => Partial<Omit<EvaluationMetrics, "latencyMs">>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : "Unknown evaluation error";
}

/** Runs cases sequentially for deterministic ordering and transparent resource accounting. */
export async function runEvaluation<TOutput extends Record<string, unknown>, TExpected = unknown>(
  options: EvaluationRunnerOptions<TOutput, TExpected>,
): Promise<EvaluationReport<TOutput>> {
  if (options.evaluators.length === 0) {
    throw new EvaluationConfigurationError("An evaluation run requires at least one evaluator.");
  }
  const evaluatorNames = new Set(options.evaluators.map((evaluator) => evaluator.name));
  if (options.evaluators.some((evaluator) => evaluator.name.trim() === "")) {
    throw new EvaluationConfigurationError("Evaluator names must not be empty.");
  }
  if (evaluatorNames.size !== options.evaluators.length) {
    throw new EvaluationConfigurationError("Evaluator names must be unique within one run.");
  }
  const now = options.now ?? (() => performance.now());
  const tracer = options.tracer ?? new NoopTracer();
  const cases: EvaluationCaseResult<TOutput>[] = [];

  for (const evaluationCase of options.dataset.cases) {
    const startedAt = now();
    let outcome: AgentRunOutcome<TOutput> | undefined;
    let executionError: unknown;
    try {
      outcome = await options.agent.run({ input: evaluationCase.input });
    } catch (error) {
      executionError = error;
    }
    const latencyMs = Math.max(0, now() - startedAt);
    const metrics: EvaluationMetrics = {
      latencyMs,
      ...(outcome === undefined ? {} : options.extractMetrics?.(outcome)),
    };
    const failures: EvaluationFailure[] = [];
    if (executionError !== undefined) {
      failures.push({ stage: "execution", message: errorMessage(executionError) });
    }

    const scores: EvaluationScore[] = [];
    for (const evaluator of options.evaluators) {
      try {
        const score = await tracer.observe(
          {
            name: `evaluator.${evaluator.name}`,
            type: "evaluator",
            input: { caseId: evaluationCase.id },
            metadata: { caseId: evaluationCase.id, dataset: options.dataset.name },
          },
          async (observation) => {
            const rawResult = await evaluator.evaluate({
              case: evaluationCase,
              outcome,
              executionError,
              metrics,
            });
            const result = await evaluationScoreSchema.parseAsync(rawResult);
            if (result.evaluator !== evaluator.name) {
              throw new EvaluatorExecutionError(
                `Evaluator "${evaluator.name}" returned score ownership for "${result.evaluator}".`,
              );
            }
            observation.update({
              output: result,
              metadata: { passed: result.passed, score: result.score },
            });
            return result;
          },
        );
        scores.push(score);
      } catch (error) {
        failures.push({
          stage: "evaluator",
          evaluator: evaluator.name,
          message: errorMessage(error),
        });
      }
    }

    const hasError = failures.length > 0;
    const passed =
      !hasError &&
      scores.length === options.evaluators.length &&
      scores.every((score) => score.passed);
    cases.push({
      caseId: evaluationCase.id,
      status: hasError ? "error" : passed ? "passed" : "failed",
      outcome,
      scores,
      metrics,
      failures,
    });
  }

  return {
    dataset: { name: options.dataset.name, version: options.dataset.version },
    cases,
    summary: summarize(cases),
  };
}

function summarize<TOutput extends Record<string, unknown>>(
  cases: readonly EvaluationCaseResult<TOutput>[],
): EvaluationSummary {
  const scores = cases.flatMap((item) => item.scores);
  const evaluatorBuckets = new Map<string, number[]>();
  for (const score of scores) {
    evaluatorBuckets.set(score.evaluator, [
      ...(evaluatorBuckets.get(score.evaluator) ?? []),
      score.score,
    ]);
  }
  const tokenMetrics = cases
    .map((item) => item.metrics.tokenUsage)
    .filter((usage) => usage !== undefined);
  const costMetrics = cases
    .map((item) => item.metrics.costUsd)
    .filter((cost) => cost !== undefined);
  const average = (values: readonly number[]) =>
    values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    totalCases: cases.length,
    passedCases: cases.filter((item) => item.status === "passed").length,
    failedCases: cases.filter((item) => item.status === "failed").length,
    errorCases: cases.filter((item) => item.status === "error").length,
    passRate:
      cases.length === 0
        ? 0
        : cases.filter((item) => item.status === "passed").length / cases.length,
    averageScore: average(scores.map((score) => score.score)),
    averageLatencyMs: average(cases.map((item) => item.metrics.latencyMs)),
    ...(tokenMetrics.length !== cases.length
      ? {}
      : {
          totalTokenUsage: tokenMetrics.reduce(
            (total, usage) => ({
              input: total.input + usage.input,
              output: total.output + usage.output,
              total: total.total + usage.total,
            }),
            { input: 0, output: 0, total: 0 },
          ),
        }),
    ...(costMetrics.length !== cases.length
      ? {}
      : { totalCostUsd: costMetrics.reduce((sum, cost) => sum + cost, 0) }),
    evaluatorScores: Object.fromEntries(
      [...evaluatorBuckets].map(([name, values]) => [name, average(values)]),
    ),
  };
}
