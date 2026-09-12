import { MessagesValue, ReducedValue, StateSchema } from "@langchain/langgraph";
import { z } from "zod";

export const AGENT_GRAPH_STATE_VERSION = 3 as const;

export const serializedAgentErrorSchema = z.object({
  node: z.string().min(1),
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean(),
  step: z.number().int().nonnegative(),
});

export const graphToolCallSchema = z.object({
  name: z.string().min(1),
  callId: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()),
});

export const graphToolResultSchema = z.object({
  name: z.string().min(1),
  callId: z.string().min(1),
  status: z.enum(["success", "error", "rejected"]),
  content: z.string(),
});

export const humanApprovalDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  actor: z.string().trim().min(1),
  reason: z.string().trim().min(1).optional(),
});

export const recordedApprovalDecisionSchema = humanApprovalDecisionSchema.extend({
  decidedAt: z.iso.datetime(),
  toolCallIds: z.array(z.string().min(1)).min(1),
});

export const toolApprovalInterruptSchema = z.object({
  kind: z.literal("tool-approval"),
  agentName: z.string().min(1),
  runId: z.string().min(1),
  sessionId: z.string().min(1),
  toolCalls: z.array(graphToolCallSchema).min(1),
  validationErrors: z.array(z.string()).optional(),
});

export const childRunRecordSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("completed"),
    agentName: z.string().min(1),
    parentRunId: z.string().min(1),
    childRunId: z.string().min(1),
    depth: z.number().int().positive(),
    output: z.record(z.string(), z.unknown()),
  }),
  z.object({
    status: z.literal("interrupted"),
    agentName: z.string().min(1),
    parentRunId: z.string().min(1),
    childRunId: z.string().min(1),
    depth: z.number().int().positive(),
    sessionId: z.string().min(1),
    interrupts: z.array(z.object({ id: z.string().min(1), value: z.unknown() })),
  }),
]);

function appendItems<T>(current: readonly T[], update: readonly T[]): T[] {
  return [...current, ...update];
}

/**
 * Persistable state shared by every explicit graph node.
 *
 * Messages, tool audit records, and errors accumulate. Identity, status, and
 * final output use last-write-wins semantics so each update is intentional.
 */
export const AgentGraphState = new StateSchema({
  schemaVersion: z.literal(AGENT_GRAPH_STATE_VERSION),
  agentName: z.string().min(1),
  runId: z.string().min(1),
  startedAt: z.iso.datetime(),
  sessionId: z.string().min(1).optional(),
  parentRunId: z.string().min(1).optional(),
  delegationDepth: z.number().int().nonnegative(),
  delegationMaxDepth: z.number().int().nonnegative(),
  promptVersion: z.string().min(1),
  messages: MessagesValue,
  stepCount: new ReducedValue(z.number().int().nonnegative().default(0), {
    inputSchema: z.number().int().nonnegative(),
    reducer: (current, update) => current + update,
  }),
  toolCalls: new ReducedValue(
    z.array(graphToolCallSchema).default(() => []),
    {
      inputSchema: z.array(graphToolCallSchema),
      reducer: appendItems,
    },
  ),
  toolResults: new ReducedValue(
    z.array(graphToolResultSchema).default(() => []),
    {
      inputSchema: z.array(graphToolResultSchema),
      reducer: appendItems,
    },
  ),
  errors: new ReducedValue(
    z.array(serializedAgentErrorSchema).default(() => []),
    {
      inputSchema: z.array(serializedAgentErrorSchema),
      reducer: appendItems,
    },
  ),
  approvalDecisions: new ReducedValue(
    z.array(recordedApprovalDecisionSchema).default(() => []),
    {
      inputSchema: z.array(recordedApprovalDecisionSchema),
      reducer: appendItems,
    },
  ),
  childRuns: new ReducedValue(
    z.array(childRunRecordSchema).default(() => []),
    {
      inputSchema: z.array(childRunRecordSchema),
      reducer: appendItems,
    },
  ),
  status: z.enum(["running", "completed", "failed"]),
  failureReason: z.string().optional(),
  finalOutput: z.unknown().optional(),
});

export type AgentGraphStateValue = typeof AgentGraphState.State;
export type AgentGraphStateUpdate = typeof AgentGraphState.Update;
export type SerializedAgentError = z.output<typeof serializedAgentErrorSchema>;
export type HumanApprovalDecision = z.output<typeof humanApprovalDecisionSchema>;
export type RecordedApprovalDecision = z.output<typeof recordedApprovalDecisionSchema>;
export type ToolApprovalInterrupt = z.output<typeof toolApprovalInterruptSchema>;
export type GraphChildRunRecord = z.output<typeof childRunRecordSchema>;

export function serializeAgentError(options: {
  node: string;
  error: unknown;
  retryable: boolean;
  step: number;
}): SerializedAgentError {
  const error = options.error instanceof Error ? options.error : new Error(String(options.error));
  return {
    node: options.node,
    code: error.name,
    message: error.message,
    retryable: options.retryable,
    step: options.step,
  };
}
