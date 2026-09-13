import type {
  AgentResumeRequest,
  AgentRunOutcome,
  AgentRunRequest,
  StructuredAgent,
} from "../core/agent-runtime.js";
import { ApiAgentAlreadyRegisteredError, ApiAgentNotFoundError } from "./errors.js";

export interface HttpAgent {
  readonly name: string;
  run(request: AgentRunRequest): Promise<AgentRunOutcome<Record<string, unknown>>>;
  resume(request: AgentResumeRequest): Promise<AgentRunOutcome<Record<string, unknown>>>;
}

/** Explicit allowlist of agents exposed by the HTTP transport. */
export class HttpAgentRegistry {
  readonly #agents = new Map<string, HttpAgent>();

  constructor(agents: readonly StructuredAgent<Record<string, unknown>>[] = []) {
    for (const agent of agents) {
      this.register(agent);
    }
  }

  register<TOutput extends Record<string, unknown>>(agent: StructuredAgent<TOutput>): this {
    const name = agent.definition.name;
    if (this.#agents.has(name)) {
      throw new ApiAgentAlreadyRegisteredError(name);
    }

    this.#agents.set(name, {
      name,
      run: async (request) => await agent.run(request),
      resume: async (request) => await agent.resume(request),
    });
    return this;
  }

  get(agentName: string): HttpAgent {
    const agent = this.#agents.get(agentName);
    if (agent === undefined) {
      throw new ApiAgentNotFoundError(agentName);
    }
    return agent;
  }
}
