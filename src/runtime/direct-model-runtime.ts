import { randomUUID } from "node:crypto";

import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import type { AgentRunResult, AgentRuntime, StructuredAgentRun } from "../core/agent-runtime.js";
import {
  AgentApprovalNotSupportedError,
  AgentExecutionError,
  StructuredOutputValidationError,
} from "../core/errors.js";
import type { ModelProviderRegistry } from "../models/registry.js";

export interface DirectModelRuntimeDependencies {
  providers: ModelProviderRegistry;
  createRunId?: () => string;
  now?: () => Date;
}

/**
 * A one-model-call runtime used by the first vertical slice.
 *
 * It establishes the runtime contract and structured-output boundary without
 * pretending to be agentic. LangGraphRuntime will add the execution loop later.
 */
export class DirectModelRuntime implements AgentRuntime {
  readonly #providers: ModelProviderRegistry;
  readonly #createRunId: () => string;
  readonly #now: () => Date;

  constructor(dependencies: DirectModelRuntimeDependencies) {
    this.#providers = dependencies.providers;
    this.#createRunId = dependencies.createRunId ?? randomUUID;
    this.#now = dependencies.now ?? (() => new Date());
  }

  async runStructured<TOutput extends Record<string, unknown>>(
    run: StructuredAgentRun<TOutput>,
  ): Promise<AgentRunResult<TOutput>> {
    if (run.definition.approvalRequiredTools.length > 0) {
      throw new AgentApprovalNotSupportedError("direct-model");
    }

    const runId = this.#createRunId();
    const startedAt = this.#now().toISOString();
    const model = this.#providers.getModel(run.definition.model);
    const structuredModel = model.withStructuredOutput(run.outputSchema, {
      name: `${run.definition.name}-output`,
    });

    let untrustedOutput: unknown;
    try {
      untrustedOutput = await structuredModel.invoke(
        [new SystemMessage(run.definition.systemPrompt), new HumanMessage(run.request.input)],
        {
          metadata: {
            ...run.request.metadata,
            agentName: run.definition.name,
            model: run.definition.model.model,
            promptVersion: run.definition.promptVersion,
            provider: run.definition.model.provider,
            runId,
            sessionId: run.request.sessionId,
          },
        },
      );
    } catch (cause) {
      throw new AgentExecutionError(`Agent "${run.definition.name}" model call failed.`, {
        cause,
      });
    }

    const validation = run.outputSchema.safeParse(untrustedOutput);
    if (!validation.success) {
      throw new StructuredOutputValidationError(
        run.definition.name,
        validation.error.issues.map((issue) => issue.message),
        { cause: validation.error },
      );
    }

    return {
      status: "completed",
      agentName: run.definition.name,
      runId,
      sessionId: run.request.sessionId,
      runtime: "direct-model",
      output: validation.data,
      stepCount: 1,
      toolCalls: [],
      approvalDecisions: [],
      startedAt,
      completedAt: this.#now().toISOString(),
    };
  }
}
