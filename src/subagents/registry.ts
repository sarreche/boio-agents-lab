import type { AgentRunOutcome, AgentRunRequest, StructuredAgent } from "../core/agent-runtime.js";
import { SubagentAlreadyRegisteredError, SubagentNotRegisteredError } from "../core/errors.js";
import type { AgentDefinition } from "../core/agent-definition.js";

export interface RegisteredSubagent {
  readonly definition: AgentDefinition;
  run(request: AgentRunRequest): Promise<AgentRunOutcome<Record<string, unknown>>>;
}

/** Explicit registry used by the composition root; no agent is globally discoverable. */
export class SubagentRegistry {
  readonly #agents = new Map<string, RegisteredSubagent>();

  constructor(agents: readonly StructuredAgent<Record<string, unknown>>[] = []) {
    for (const agent of agents) {
      this.register(agent);
    }
  }

  register<TOutput extends Record<string, unknown>>(agent: StructuredAgent<TOutput>): void {
    if (this.#agents.has(agent.definition.name)) {
      throw new SubagentAlreadyRegisteredError(agent.definition.name);
    }
    this.#agents.set(agent.definition.name, {
      definition: agent.definition,
      run: (request) => agent.run(request),
    });
  }

  get(agentName: string): RegisteredSubagent {
    const agent = this.#agents.get(agentName);
    if (agent === undefined) {
      throw new SubagentNotRegisteredError(agentName);
    }
    return agent;
  }

  list(): readonly RegisteredSubagent[] {
    return [...this.#agents.values()];
  }
}
