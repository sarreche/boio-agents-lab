import { z } from "zod";

import type { AgentDefinition } from "../core/agent-definition.js";
import type { ChildRunRecord } from "../core/agent-runtime.js";
import { SubagentDepthLimitError, SubagentNotAuthorizedError } from "../core/errors.js";
import type { SubagentRegistry } from "./registry.js";

export const DELEGATE_AGENT_TOOL_NAME = "delegate_agent";

export const delegationArgumentsSchema = z.object({
  agentName: z.string().min(1),
  task: z.string().min(1),
});

export interface DelegateSubagentRequest {
  parentDefinition: AgentDefinition;
  parentRunId: string;
  parentDepth: number;
  inheritedMaxDepth: number;
  agentName: string;
  task: string;
}

/** Resolves one authorized child and executes it with isolated input and lineage. */
export class SubagentCoordinator {
  readonly #registry: SubagentRegistry;

  constructor(registry: SubagentRegistry) {
    this.#registry = registry;
  }

  describeAuthorized(agentNames: readonly string[]): string {
    return agentNames
      .map((agentName) => {
        const definition = this.#registry.get(agentName).definition;
        return `${definition.name}: ${definition.description}`;
      })
      .join("; ");
  }

  async delegate(request: DelegateSubagentRequest): Promise<ChildRunRecord> {
    if (!request.parentDefinition.subagents.includes(request.agentName)) {
      throw new SubagentNotAuthorizedError(request.parentDefinition.name, request.agentName);
    }

    const child = this.#registry.get(request.agentName);
    const effectiveMaxDepth = Math.min(
      request.inheritedMaxDepth,
      request.parentDepth + request.parentDefinition.maxSubagentDepth,
    );
    const childDepth = request.parentDepth + 1;
    if (childDepth > effectiveMaxDepth) {
      throw new SubagentDepthLimitError(effectiveMaxDepth);
    }

    const outcome = await child.run({
      input: request.task,
      metadata: {
        parentAgentName: request.parentDefinition.name,
        parentRunId: request.parentRunId,
        delegationDepth: childDepth,
      },
      lineage: {
        parentRunId: request.parentRunId,
        depth: childDepth,
        maxDepth: effectiveMaxDepth,
      },
    });

    if (outcome.status === "interrupted") {
      return {
        status: "interrupted",
        agentName: outcome.agentName,
        parentRunId: request.parentRunId,
        childRunId: outcome.runId,
        depth: childDepth,
        sessionId: outcome.sessionId,
        interrupts: outcome.interrupts,
      };
    }

    return {
      status: "completed",
      agentName: outcome.agentName,
      parentRunId: request.parentRunId,
      childRunId: outcome.runId,
      depth: childDepth,
      output: outcome.output,
    };
  }
}
