import { tool as createLangChainTool, type ClientTool } from "@langchain/core/tools";
import type { z } from "zod";

import {
  InvalidToolArgumentsError,
  InvalidToolDefinitionError,
  InvalidToolOutputError,
  MiniAgentsError,
  ToolExecutionError,
} from "../core/errors.js";

export interface ToolExecutionContext {
  signal: AbortSignal;
  runId?: string;
  sessionId?: string;
}

export interface RegisteredTool {
  readonly name: string;
  readonly description: string;
  invoke(input: unknown, context: ToolExecutionContext): Promise<unknown>;
  createLangChainAdapter(execute: (input: unknown) => Promise<unknown>): ClientTool;
}

export interface ToolDefinition<TInputSchema extends z.ZodObject, TOutputSchema extends z.ZodType> {
  name: string;
  description: string;
  inputSchema: TInputSchema;
  outputSchema: TOutputSchema;
  execute(
    input: z.output<TInputSchema>,
    context: ToolExecutionContext,
  ): z.input<TOutputSchema> | Promise<z.input<TOutputSchema>>;
}

function serializeForModel(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  const serialized: unknown = JSON.stringify(value);
  return typeof serialized === "string" ? serialized : "null";
}

/** Defines one validated tool while preserving its concrete input/output types. */
export function defineTool<TInputSchema extends z.ZodObject, TOutputSchema extends z.ZodType>(
  definition: ToolDefinition<TInputSchema, TOutputSchema>,
): RegisteredTool {
  if (!/^[a-z][a-z0-9_]*$/.test(definition.name)) {
    throw new InvalidToolDefinitionError(
      `name "${definition.name}" must use lower snake_case characters.`,
    );
  }
  if (definition.description.trim() === "") {
    throw new InvalidToolDefinitionError("description must not be empty.");
  }

  const invoke = async (
    untrustedInput: unknown,
    context: ToolExecutionContext,
  ): Promise<unknown> => {
    const inputValidation = await definition.inputSchema.safeParseAsync(untrustedInput);
    if (!inputValidation.success) {
      throw new InvalidToolArgumentsError(
        definition.name,
        inputValidation.error.issues.map((issue) => issue.message),
        { cause: inputValidation.error },
      );
    }

    let untrustedOutput: unknown;
    try {
      untrustedOutput = await definition.execute(inputValidation.data, context);
    } catch (cause) {
      if (cause instanceof MiniAgentsError) {
        throw cause;
      }
      throw new ToolExecutionError(definition.name, { cause });
    }

    const outputValidation = await definition.outputSchema.safeParseAsync(untrustedOutput);
    if (!outputValidation.success) {
      throw new InvalidToolOutputError(
        definition.name,
        outputValidation.error.issues.map((issue) => issue.message),
        { cause: outputValidation.error },
      );
    }

    return outputValidation.data;
  };

  return {
    name: definition.name,
    description: definition.description,
    invoke,
    createLangChainAdapter: (execute) =>
      createLangChainTool(async (input) => serializeForModel(await execute(input)), {
        name: definition.name,
        description: definition.description,
        schema: definition.inputSchema,
      }),
  };
}
