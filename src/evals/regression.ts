import { RegressionThresholdError } from "../core/errors.js";
import type { EvaluationReport } from "./runner.js";

export interface RegressionThresholds {
  minimumPassRate: number;
  minimumAverageScore: number;
  maximumErrorRate?: number;
  maximumAverageLatencyMs?: number;
  minimumEvaluatorScores?: Readonly<Record<string, number>>;
}

function validateRate(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1)
    throw new RangeError(`${name} must be between 0 and 1.`);
}

/** Throws a typed error so CLI/test runners naturally return a non-zero exit code. */
export function assertRegressionThresholds<TOutput extends Record<string, unknown>>(
  report: EvaluationReport<TOutput>,
  thresholds: RegressionThresholds,
): void {
  validateRate("minimumPassRate", thresholds.minimumPassRate);
  validateRate("minimumAverageScore", thresholds.minimumAverageScore);
  if (thresholds.maximumErrorRate !== undefined)
    validateRate("maximumErrorRate", thresholds.maximumErrorRate);
  if (
    thresholds.maximumAverageLatencyMs !== undefined &&
    (!Number.isFinite(thresholds.maximumAverageLatencyMs) || thresholds.maximumAverageLatencyMs < 0)
  ) {
    throw new RangeError("maximumAverageLatencyMs must be non-negative.");
  }
  const violations: string[] = [];
  const errorRate =
    report.summary.totalCases === 0 ? 1 : report.summary.errorCases / report.summary.totalCases;
  if (report.summary.passRate < thresholds.minimumPassRate)
    violations.push(
      `pass rate ${report.summary.passRate.toFixed(3)} is below ${thresholds.minimumPassRate.toFixed(3)}`,
    );
  if (report.summary.averageScore < thresholds.minimumAverageScore)
    violations.push(
      `average score ${report.summary.averageScore.toFixed(3)} is below ${thresholds.minimumAverageScore.toFixed(3)}`,
    );
  if (thresholds.maximumErrorRate !== undefined && errorRate > thresholds.maximumErrorRate)
    violations.push(
      `error rate ${errorRate.toFixed(3)} exceeds ${thresholds.maximumErrorRate.toFixed(3)}`,
    );
  if (
    thresholds.maximumAverageLatencyMs !== undefined &&
    report.summary.averageLatencyMs > thresholds.maximumAverageLatencyMs
  )
    violations.push(
      `average latency ${report.summary.averageLatencyMs.toFixed(1)} ms exceeds ${thresholds.maximumAverageLatencyMs.toFixed(1)} ms`,
    );
  for (const [name, minimum] of Object.entries(thresholds.minimumEvaluatorScores ?? {})) {
    validateRate(`minimumEvaluatorScores.${name}`, minimum);
    const actual = report.summary.evaluatorScores[name];
    if (actual === undefined || actual < minimum)
      violations.push(
        `evaluator ${name} score ${actual?.toFixed(3) ?? "missing"} is below ${minimum.toFixed(3)}`,
      );
  }
  if (violations.length > 0) throw new RegressionThresholdError(violations);
}
