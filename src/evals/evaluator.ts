import type { AgentRunOutcome } from "../core/agent-runtime.js";
import { z } from "zod";
import type { EvaluationCase } from "./dataset.js";

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface EvaluationMetrics {
  latencyMs: number;
  tokenUsage?: TokenUsage;
  costUsd?: number;
}

export interface EvaluationContext<TOutput extends Record<string, unknown>, TExpected = unknown> {
  case: EvaluationCase<TExpected>;
  outcome?: AgentRunOutcome<TOutput>;
  executionError?: unknown;
  metrics: EvaluationMetrics;
}

export const evaluationScoreSchema = z.object({
  evaluator: z.string().trim().min(1),
  score: z.number().min(0).max(1),
  passed: z.boolean(),
  message: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type EvaluationScore = z.output<typeof evaluationScoreSchema>;

export interface Evaluator<TOutput extends Record<string, unknown>, TExpected = unknown> {
  name: string;
  evaluate(context: EvaluationContext<TOutput, TExpected>): Promise<EvaluationScore>;
}

export function createScore(
  evaluator: string,
  passed: boolean,
  options: {
    score?: number;
    message?: string;
    details?: Readonly<Record<string, unknown>>;
  } = {},
): EvaluationScore {
  const score = options.score ?? (passed ? 1 : 0);
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    throw new RangeError(`Evaluator "${evaluator}" score must be between 0 and 1.`);
  }
  return evaluationScoreSchema.parse({ evaluator, passed, score, ...options });
}
