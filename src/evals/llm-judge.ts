import { z } from "zod";

import { EvaluatorExecutionError } from "../core/errors.js";
import type { Evaluator } from "./evaluator.js";
import { createScore } from "./evaluator.js";

export const judgeResultSchema = z.object({
  correctness: z.number().int().min(0).max(4),
  completeness: z.number().int().min(0).max(4),
  relevance: z.number().int().min(0).max(4),
  groundedness: z.number().int().min(0).max(4),
  rationale: z.string().min(1),
});

export type JudgeResult = z.output<typeof judgeResultSchema>;

export interface JudgeRequest {
  input: string;
  expected?: unknown;
  expectedBehavior?: string;
  output: Readonly<Record<string, unknown>>;
}

/** Port for a structured judge; production and fake model adapters share this boundary. */
export interface JudgeModel {
  judge(request: JudgeRequest): Promise<unknown>;
}

export function createLlmJudgeEvaluator<
  TOutput extends Record<string, unknown>,
  TExpected = unknown,
>(options: { model: JudgeModel; passThreshold?: number }): Evaluator<TOutput, TExpected> {
  const passThreshold = options.passThreshold ?? 0.75;
  if (passThreshold < 0 || passThreshold > 1)
    throw new RangeError("Judge passThreshold must be between 0 and 1.");
  return {
    name: "llm-judge",
    async evaluate(context) {
      if (context.outcome?.status !== "completed") {
        throw new EvaluatorExecutionError("LLM judge requires a completed agent output.");
      }
      let rawResult: unknown;
      try {
        rawResult = await options.model.judge({
          input: context.case.input,
          expected: context.case.expected,
          expectedBehavior: context.case.expectedBehavior,
          output: context.outcome.output,
        });
      } catch (cause) {
        throw new EvaluatorExecutionError("LLM judge model call failed.", { cause });
      }
      const validation = await judgeResultSchema.safeParseAsync(rawResult);
      if (!validation.success) {
        throw new EvaluatorExecutionError("LLM judge returned an invalid structured result.", {
          cause: validation.error,
        });
      }
      const dimensions = [
        validation.data.correctness,
        validation.data.completeness,
        validation.data.relevance,
        validation.data.groundedness,
      ];
      const score = dimensions.reduce((sum, value) => sum + value, 0) / 16;
      return createScore("llm-judge", score >= passThreshold, {
        score,
        message: validation.data.rationale,
        details: validation.data,
      });
    },
  };
}
