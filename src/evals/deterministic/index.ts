import type { z } from "zod";

import type { EvaluationContext, Evaluator } from "../evaluator.js";
import { createScore } from "../evaluator.js";

function completedOutput<TOutput extends Record<string, unknown>, TExpected>(
  context: EvaluationContext<TOutput, TExpected>,
): TOutput | undefined {
  return context.outcome?.status === "completed" ? context.outcome.output : undefined;
}

export function createSchemaEvaluator<TOutput extends Record<string, unknown>, TExpected = unknown>(
  schema: z.ZodType<TOutput>,
): Evaluator<TOutput, TExpected> {
  return {
    name: "schema-validity",
    evaluate: (context) => {
      const output = completedOutput(context);
      const validation = schema.safeParse(output);
      return Promise.resolve(
        createScore("schema-validity", validation.success, {
          message: validation.success
            ? "Output matches the expected schema."
            : "Output is missing or invalid.",
          details: validation.success
            ? undefined
            : { issues: validation.error.issues.map((issue) => issue.message) },
        }),
      );
    },
  };
}

export function createRequiredFieldsEvaluator<
  TOutput extends Record<string, unknown>,
  TExpected = unknown,
>(requiredFields: readonly (keyof TOutput & string)[]): Evaluator<TOutput, TExpected> {
  return {
    name: "required-fields",
    evaluate: (context) => {
      const output = completedOutput(context);
      const missing = requiredFields.filter((field) => output?.[field] === undefined);
      return Promise.resolve(
        createScore("required-fields", missing.length === 0, {
          message:
            missing.length === 0
              ? "All required fields are present."
              : `Missing fields: ${missing.join(", ")}.`,
          details: { requiredFields, missingFields: missing },
        }),
      );
    },
  };
}

export function createExpectedToolsEvaluator<
  TOutput extends Record<string, unknown>,
  TExpected = unknown,
>(): Evaluator<TOutput, TExpected> {
  return {
    name: "expected-tools",
    evaluate: (context) => {
      const called = new Set(context.outcome?.toolCalls.map((call) => call.name) ?? []);
      const missing = context.case.expectedTools.filter((name) => !called.has(name));
      return Promise.resolve(
        createScore("expected-tools", missing.length === 0, {
          message:
            missing.length === 0
              ? "All expected tools were called."
              : `Expected tools not called: ${missing.join(", ")}.`,
          details: { missingTools: missing },
        }),
      );
    },
  };
}

export function createForbiddenToolsEvaluator<
  TOutput extends Record<string, unknown>,
  TExpected = unknown,
>(): Evaluator<TOutput, TExpected> {
  return {
    name: "forbidden-tools",
    evaluate: (context) => {
      const called = new Set(context.outcome?.toolCalls.map((call) => call.name) ?? []);
      const violations = context.case.forbiddenTools.filter((name) => called.has(name));
      return Promise.resolve(
        createScore("forbidden-tools", violations.length === 0, {
          message:
            violations.length === 0
              ? "No forbidden tools were called."
              : `Forbidden tools called: ${violations.join(", ")}.`,
          details: { forbiddenToolCalls: violations },
        }),
      );
    },
  };
}

export function createMaxStepsEvaluator<
  TOutput extends Record<string, unknown>,
  TExpected = unknown,
>(maxSteps: number): Evaluator<TOutput, TExpected> {
  if (!Number.isInteger(maxSteps)) throw new RangeError("max-steps maximum must be an integer.");
  return thresholdEvaluator(
    "max-steps",
    maxSteps,
    (context) => context.outcome?.stepCount,
    "steps",
  );
}

export function createLatencyEvaluator<
  TOutput extends Record<string, unknown>,
  TExpected = unknown,
>(maxLatencyMs: number): Evaluator<TOutput, TExpected> {
  return thresholdEvaluator("latency", maxLatencyMs, (context) => context.metrics.latencyMs, "ms");
}

export function createCostEvaluator<TOutput extends Record<string, unknown>, TExpected = unknown>(
  maxCostUsd: number,
): Evaluator<TOutput, TExpected> {
  return thresholdEvaluator("cost", maxCostUsd, (context) => context.metrics.costUsd, "USD");
}

function thresholdEvaluator<TOutput extends Record<string, unknown>, TExpected>(
  name: string,
  maximum: number,
  select: (context: EvaluationContext<TOutput, TExpected>) => number | undefined,
  unit: string,
): Evaluator<TOutput, TExpected> {
  if (!Number.isFinite(maximum) || maximum < 0)
    throw new RangeError(`${name} maximum must be non-negative.`);
  return {
    name,
    evaluate: (context) => {
      const actual = select(context);
      const passed = actual !== undefined && actual <= maximum;
      return Promise.resolve(
        createScore(name, passed, {
          message:
            actual === undefined
              ? `${name} metric is unavailable.`
              : `${String(actual)} ${unit} / maximum ${String(maximum)} ${unit}.`,
          details: { actual, maximum, unit },
        }),
      );
    },
  };
}
