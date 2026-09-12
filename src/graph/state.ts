import { MessagesValue, ReducedValue, StateSchema } from "@langchain/langgraph";
import { z } from "zod";

export const AGENT_GRAPH_STATE_VERSION = 1 as const;

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
  status: z.enum(["success", "error"]),
  content: z.string(),
});

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
  sessionId: z.string().min(1).optional(),
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
  status: z.enum(["running", "completed", "failed"]),
  failureReason: z.string().optional(),
  finalOutput: z.unknown().optional(),
});

export type AgentGraphStateValue = typeof AgentGraphState.State;
export type AgentGraphStateUpdate = typeof AgentGraphState.Update;
export type SerializedAgentError = z.output<typeof serializedAgentErrorSchema>;

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
