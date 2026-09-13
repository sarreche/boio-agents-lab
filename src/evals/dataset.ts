import { z } from "zod";

import { EvaluationConfigurationError } from "../core/errors.js";

const evaluationCaseSchema = z.object({
  id: z.string().trim().min(1),
  input: z.string().min(1),
  expected: z.unknown().optional(),
  expectedBehavior: z.string().min(1).optional(),
  expectedTools: z.array(z.string().min(1)).default([]),
  forbiddenTools: z.array(z.string().min(1)).default([]),
  tags: z.array(z.string().min(1)).default([]),
});

const evaluationDatasetSchema = z.object({
  name: z.string().trim().min(1),
  version: z.string().trim().min(1),
  cases: z.array(evaluationCaseSchema).min(1),
});

export interface EvaluationCase<TExpected = unknown> {
  id: string;
  input: string;
  expected?: TExpected;
  expectedBehavior?: string;
  expectedTools: readonly string[];
  forbiddenTools: readonly string[];
  tags: readonly string[];
}

export interface EvaluationDataset<TExpected = unknown> {
  name: string;
  version: string;
  cases: readonly EvaluationCase<TExpected>[];
}

/** Validates a versioned dataset and rejects ambiguous duplicate case IDs. */
export function defineEvaluationDataset<TExpected = unknown>(
  input: EvaluationDataset<TExpected>,
): EvaluationDataset<TExpected> {
  const parsed = evaluationDatasetSchema.parse(input) as EvaluationDataset<TExpected>;
  const ids = new Set<string>();
  for (const evaluationCase of parsed.cases) {
    if (ids.has(evaluationCase.id)) {
      throw new EvaluationConfigurationError(
        `Evaluation dataset "${parsed.name}" contains duplicate case id "${evaluationCase.id}".`,
      );
    }
    ids.add(evaluationCase.id);
  }
  return parsed;
}
