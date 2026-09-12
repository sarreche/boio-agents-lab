import type { z } from "zod";

import type { AgentDefinition } from "./agent-definition.js";
import { AgentResumeNotSupportedError } from "./errors.js";

export interface AgentRunRequest {
  input: string;
  sessionId?: string;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface AgentResumeRequest {
  sessionId: string;
  value: unknown;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface ToolCallRecord {
  name: string;
  callId: string;
  arguments: Readonly<Record<string, unknown>>;
}

/** Auditable human decision recorded before guarded tool effects. */
export interface ApprovalDecisionRecord {
  decision: "approve" | "reject";
  actor: string;
  reason?: string;
  decidedAt: string;
  toolCallIds: readonly string[];
}

export interface AgentRunResult<TOutput extends Record<string, unknown>> {
  status: "completed";
  agentName: string;
  runId: string;
  sessionId?: string;
  runtime: string;
  output: TOutput;
  stepCount: number;
  toolCalls: readonly ToolCallRecord[];
  approvalDecisions: readonly ApprovalDecisionRecord[];
  startedAt: string;
  completedAt: string;
}

export interface AgentInterruptRecord {
  id: string;
  value: unknown;
}

export interface AgentInterruptedResult {
  status: "interrupted";
  agentName: string;
  runId: string;
  sessionId: string;
  runtime: string;
  interrupts: readonly AgentInterruptRecord[];
  stepCount: number;
  toolCalls: readonly ToolCallRecord[];
  approvalDecisions: readonly ApprovalDecisionRecord[];
  startedAt: string;
  interruptedAt: string;
}

export type AgentRunOutcome<TOutput extends Record<string, unknown>> =
  AgentRunResult<TOutput> | AgentInterruptedResult;

export type StructuredOutputSchema<TOutput extends Record<string, unknown>> = z.ZodObject &
  z.ZodType<TOutput>;

export interface StructuredAgentRun<TOutput extends Record<string, unknown>> {
  definition: AgentDefinition;
  request: AgentRunRequest;
  outputSchema: StructuredOutputSchema<TOutput>;
}

export interface StructuredAgentResume<TOutput extends Record<string, unknown>> {
  definition: AgentDefinition;
  request: AgentResumeRequest;
  outputSchema: StructuredOutputSchema<TOutput>;
}

/** Common execution port implemented by the direct, LangGraph, and Deep Agents runtimes. */
export interface AgentRuntime {
  runStructured<TOutput extends Record<string, unknown>>(
    run: StructuredAgentRun<TOutput>,
  ): Promise<AgentRunOutcome<TOutput>>;
  resumeStructured?<TOutput extends Record<string, unknown>>(
    resume: StructuredAgentResume<TOutput>,
  ): Promise<AgentRunOutcome<TOutput>>;
}

export interface StructuredAgent<TOutput extends Record<string, unknown>> {
  readonly definition: AgentDefinition;
  run(request: AgentRunRequest): Promise<AgentRunOutcome<TOutput>>;
  resume(request: AgentResumeRequest): Promise<AgentRunOutcome<TOutput>>;
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
    resume: async (request) => {
      if (options.runtime.resumeStructured === undefined) {
        throw new AgentResumeNotSupportedError(
          `Runtime does not support resuming interrupted agent runs.`,
        );
      }
      return await options.runtime.resumeStructured({
        definition: options.definition,
        outputSchema: options.outputSchema,
        request,
      });
    },
  };
}
