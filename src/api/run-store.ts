import type { AgentRunOutcome } from "../core/agent-runtime.js";
import { ApiRunNotFoundError, ApiSessionNotFoundError } from "./errors.js";

export interface ApiRunRecord {
  runId: string;
  agentName: string;
  sessionId?: string;
  status: AgentRunOutcome<Record<string, unknown>>["status"];
  outcome: AgentRunOutcome<Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
}

export interface ApiSessionRecord {
  sessionId: string;
  agentName: string;
  runId: string;
  status: AgentRunOutcome<Record<string, unknown>>["status"];
  updatedAt: string;
}

export interface ApiRunStore {
  save(outcome: AgentRunOutcome<Record<string, unknown>>): Promise<ApiRunRecord>;
  getRun(runId: string): Promise<ApiRunRecord>;
  getSession(sessionId: string): Promise<ApiSessionRecord>;
}

/** Process-local query index; checkpoints remain owned by the runtime. */
export class InMemoryApiRunStore implements ApiRunStore {
  readonly #runs = new Map<string, ApiRunRecord>();
  readonly #sessions = new Map<string, ApiSessionRecord>();
  readonly #now: () => Date;

  constructor(options: { now?: () => Date } = {}) {
    this.#now = options.now ?? (() => new Date());
  }

  save(outcome: AgentRunOutcome<Record<string, unknown>>): Promise<ApiRunRecord> {
    const timestamp = this.#now().toISOString();
    const previous = this.#runs.get(outcome.runId);
    const record: ApiRunRecord = {
      runId: outcome.runId,
      agentName: outcome.agentName,
      ...(outcome.sessionId === undefined ? {} : { sessionId: outcome.sessionId }),
      status: outcome.status,
      outcome,
      createdAt: previous?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    this.#runs.set(record.runId, record);

    if (record.sessionId !== undefined) {
      this.#sessions.set(record.sessionId, {
        sessionId: record.sessionId,
        agentName: record.agentName,
        runId: record.runId,
        status: record.status,
        updatedAt: timestamp,
      });
    }
    return Promise.resolve(record);
  }

  getRun(runId: string): Promise<ApiRunRecord> {
    const record = this.#runs.get(runId);
    if (record === undefined) {
      throw new ApiRunNotFoundError(runId);
    }
    return Promise.resolve(record);
  }

  getSession(sessionId: string): Promise<ApiSessionRecord> {
    const record = this.#sessions.get(sessionId);
    if (record === undefined) {
      throw new ApiSessionNotFoundError(sessionId);
    }
    return Promise.resolve(record);
  }
}
