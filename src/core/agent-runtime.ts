import type { z } from "zod";

import type { AgentDefinition } from "./agent-definition.js";

export interface AgentRunRequest {
  input: string;
  sessionId?: string;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface ToolCallRecord {
  name: string;
  callId: string;
  arguments: Readonly<Record<string, unknown>>;
}

export interface AgentRunResult<TOutput extends Record<string, unknown>> {
  agentName: string;
  runId: string;
  sessionId?: string;
  runtime: string;
  output: TOutput;
  stepCount: number;
  toolCalls: readonly ToolCallRecord[];
  startedAt: string;
  completedAt: string;
}

export type StructuredOutputSchema<TOutput extends Record<string, unknown>> = z.ZodObject &
  z.ZodType<TOutput>;

export interface StructuredAgentRun<TOutput extends Record<string, unknown>> {
  definition: AgentDefinition;
  request: AgentRunRequest;
  outputSchema: StructuredOutputSchema<TOutput>;
}

/** Common execution port implemented by the direct, LangGraph, and Deep Agents runtimes. */
export interface AgentRuntime {
  runStructured<TOutput extends Record<string, unknown>>(
    run: StructuredAgentRun<TOutput>,
  ): Promise<AgentRunResult<TOutput>>;
}

export interface StructuredAgent<TOutput extends Record<string, unknown>> {
  readonly definition: AgentDefinition;
  run(request: AgentRunRequest): Promise<AgentRunResult<TOutput>>;
}

export function createStructuredAgent<TOutput extends Record<string, unknown>>(options: {
  definition: AgentDefinition;
  outputSchema: StructuredOutputSchema<TOutput>;
  runtime: AgentRuntime;
}): StructuredAgent<TOutput> {
  return {
    definition: options.definition,
    run: (request) =>
      options.runtime.runStructured({
        definition: options.definition,
        outputSchema: options.outputSchema,
        request,
      }),
  };
}
