import { describe, expect, it } from "vitest";

import { AgentStateMigrationError } from "../../src/core/errors.js";
import { AGENT_GRAPH_STATE_VERSION } from "../../src/graph/state.js";
import { migratePersistedAgentState } from "../../src/persistence/agent-state-migrations.js";

const baseState = {
  agentName: "researcher",
  runId: "run-1",
  promptVersion: "1.0.0",
  messages: [],
  stepCount: 0,
  toolCalls: [],
  toolResults: [],
  errors: [],
  status: "running",
} as const;

describe("migratePersistedAgentState", () => {
  it("migrates v1 snapshots through every version without inventing lineage", () => {
    const migrated = migratePersistedAgentState(
      { ...baseState, schemaVersion: 1 },
      {
        v1StartedAt: "2026-09-13T12:00:00.000Z",
        defaultDelegationMaxDepth: 3,
      },
    );

    expect(migrated).toMatchObject({
      schemaVersion: AGENT_GRAPH_STATE_VERSION,
      startedAt: "2026-09-13T12:00:00.000Z",
      approvalDecisions: [],
      delegationDepth: 0,
      delegationMaxDepth: 3,
      childRuns: [],
    });
  });

  it("migrates v2 while preserving approval audit records", () => {
    const approval = {
      decision: "approve" as const,
      actor: "reviewer",
      decidedAt: "2026-09-13T12:01:00.000Z",
      toolCallIds: ["tool-1"],
    };
    const migrated = migratePersistedAgentState(
      {
        ...baseState,
        schemaVersion: 2,
        startedAt: "2026-09-13T12:00:00.000Z",
        approvalDecisions: [approval],
      },
      { v1StartedAt: "2026-09-13T12:00:00.000Z" },
    );

    expect(migrated.approvalDecisions).toEqual([approval]);
    expect(migrated.delegationMaxDepth).toBe(0);
  });

  it("validates current snapshots without changing extension fields", () => {
    const migrated = migratePersistedAgentState(
      {
        ...baseState,
        schemaVersion: 3,
        startedAt: "2026-09-13T12:00:00.000Z",
        approvalDecisions: [],
        delegationDepth: 0,
        delegationMaxDepth: 2,
        childRuns: [],
        adapterMetadata: { checkpoint: "opaque" },
      },
      { v1StartedAt: "unused-for-v3" },
    );

    expect(migrated.adapterMetadata).toEqual({ checkpoint: "opaque" });
  });

  it("rejects missing, future, and invalid migrated states", () => {
    expect(() =>
      migratePersistedAgentState({}, { v1StartedAt: "2026-09-13T12:00:00.000Z" }),
    ).toThrow(AgentStateMigrationError);
    expect(() =>
      migratePersistedAgentState(
        { ...baseState, schemaVersion: AGENT_GRAPH_STATE_VERSION + 1 },
        { v1StartedAt: "2026-09-13T12:00:00.000Z" },
      ),
    ).toThrow("newer than supported");
    expect(() =>
      migratePersistedAgentState({ ...baseState, schemaVersion: 1 }, { v1StartedAt: "not-a-date" }),
    ).toThrow("v1StartedAt must be an ISO datetime");
    expect(() =>
      migratePersistedAgentState(
        { ...baseState, schemaVersion: 3, startedAt: "not-a-date" },
        { v1StartedAt: "unused-for-v3" },
      ),
    ).toThrow("invalid after migration");
  });
});
