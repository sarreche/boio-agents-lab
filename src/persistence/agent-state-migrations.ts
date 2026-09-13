import { z } from "zod";

import { AgentStateMigrationError } from "../core/errors.js";
import {
  AGENT_GRAPH_STATE_VERSION,
  childRunRecordSchema,
  graphToolCallSchema,
  graphToolResultSchema,
  recordedApprovalDecisionSchema,
  serializedAgentErrorSchema,
} from "../graph/state.js";

const versionedStateSchema = z.looseObject({
  schemaVersion: z.number().int().positive(),
});

export const persistedAgentStateSchema = z.looseObject({
  schemaVersion: z.literal(AGENT_GRAPH_STATE_VERSION),
  agentName: z.string().min(1),
  runId: z.string().min(1),
  startedAt: z.iso.datetime(),
  sessionId: z.string().min(1).optional(),
  parentRunId: z.string().min(1).optional(),
  delegationDepth: z.number().int().nonnegative(),
  delegationMaxDepth: z.number().int().nonnegative(),
  promptVersion: z.string().min(1),
  messages: z.unknown(),
  stepCount: z.number().int().nonnegative(),
  toolCalls: z.array(graphToolCallSchema),
  toolResults: z.array(graphToolResultSchema),
  errors: z.array(serializedAgentErrorSchema),
  approvalDecisions: z.array(recordedApprovalDecisionSchema),
  childRuns: z.array(childRunRecordSchema),
  status: z.enum(["running", "completed", "failed"]),
  failureReason: z.string().optional(),
  finalOutput: z.unknown().optional(),
});

export type PersistedAgentState = z.output<typeof persistedAgentStateSchema>;

export interface AgentStateMigrationOptions {
  /** Timestamp used only for v1 snapshots, which predate startedAt. */
  v1StartedAt: string;
  defaultDelegationMaxDepth?: number;
}

/** Upgrades serialized state before a durable checkpointer restores it. */
export function migratePersistedAgentState(
  input: unknown,
  options: AgentStateMigrationOptions,
): PersistedAgentState {
  const versioned = versionedStateSchema.safeParse(input);
  if (!versioned.success) {
    throw new AgentStateMigrationError("Persisted agent state has no valid schemaVersion.", {
      cause: versioned.error,
    });
  }
  if (versioned.data.schemaVersion > AGENT_GRAPH_STATE_VERSION) {
    throw new AgentStateMigrationError(
      `Persisted state version ${String(versioned.data.schemaVersion)} is newer than supported version ${String(AGENT_GRAPH_STATE_VERSION)}.`,
    );
  }

  let state = { ...versioned.data };
  if (state.schemaVersion === 1) {
    const timestamp = z.iso.datetime().safeParse(options.v1StartedAt);
    if (!timestamp.success) {
      throw new AgentStateMigrationError("v1StartedAt must be an ISO datetime.", {
        cause: timestamp.error,
      });
    }
    state = {
      ...state,
      schemaVersion: 2,
      startedAt: timestamp.data,
      approvalDecisions: [],
    };
  }
  if (state.schemaVersion === 2) {
    state = {
      ...state,
      schemaVersion: 3,
      delegationDepth: 0,
      delegationMaxDepth: options.defaultDelegationMaxDepth ?? 0,
      childRuns: [],
    };
  }

  const migrated = persistedAgentStateSchema.safeParse(state);
  if (!migrated.success) {
    throw new AgentStateMigrationError("Persisted agent state is invalid after migration.", {
      cause: migrated.error,
    });
  }
  return migrated.data;
}
