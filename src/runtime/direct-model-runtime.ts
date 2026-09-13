import { randomUUID } from "node:crypto";

import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import type { AgentRunResult, AgentRuntime, StructuredAgentRun } from "../core/agent-runtime.js";
import { executeWithDeadline } from "../core/execution-deadline.js";
import {
  AgentApprovalNotSupportedError,
  AgentDelegationNotSupportedError,
  AgentExecutionError,
  AgentRunTimeoutError,
  StructuredOutputValidationError,
} from "../core/errors.js";
import type { ModelProviderRegistry } from "../models/registry.js";
import { NoopTracer } from "../observability/noop-tracer.js";
import type { Tracer } from "../observability/tracer.js";

export interface DirectModelRuntimeDependencies {
  providers: ModelProviderRegistry;
  createRunId?: () => string;
  now?: () => Date;
  tracer?: Tracer;
  runTimeoutMs?: number;
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
  readonly #tracer: Tracer;
  readonly #runTimeoutMs: number;

  constructor(dependencies: DirectModelRuntimeDependencies) {
    this.#providers = dependencies.providers;
    this.#createRunId = dependencies.createRunId ?? randomUUID;
    this.#now = dependencies.now ?? (() => new Date());
    this.#tracer = dependencies.tracer ?? new NoopTracer();
    this.#runTimeoutMs = dependencies.runTimeoutMs ?? 300_000;
  }

  async runStructured<TOutput extends Record<string, unknown>>(
    run: StructuredAgentRun<TOutput>,
  ): Promise<AgentRunResult<TOutput>> {
    if (run.definition.approvalRequiredTools.length > 0) {
      throw new AgentApprovalNotSupportedError("direct-model");
    }
    if (run.definition.subagents.length > 0) {
      throw new AgentDelegationNotSupportedError("direct-model");
    }

    const runId = this.#createRunId();
    const startedAt = this.#now().toISOString();
    const model = this.#providers.getModel(run.definition.model);
    const structuredModel = model.withStructuredOutput(run.outputSchema, {
      name: `${run.definition.name}-output`,
    });

    return this.#tracer.observe(
      {
        name: `agent.${run.definition.name}`,
        type: "agent",
        input: run.request.input,
        metadata: {
          agentName: run.definition.name,
          parentRunId: run.request.lineage?.parentRunId,
          promptName: run.definition.name,
          promptVersion: run.definition.promptVersion,
          provider: run.definition.model.provider,
          runId,
          sessionId: run.request.sessionId,
        },
      },
      async (agentObservation) => {
        let untrustedOutput: unknown;
        try {
          untrustedOutput = await this.#tracer.observe(
            {
              name: `generation.${run.definition.name}`,
              type: "generation",
              input: run.request.input,
              model: run.definition.model.model,
              modelParameters: { temperature: run.definition.model.temperature },
              metadata: {
                promptVersion: run.definition.promptVersion,
                promptName: run.definition.name,
                provider: run.definition.model.provider,
                runId,
              },
            },
            async (generationObservation) => {
              const response = await executeWithDeadline({
                timeoutMs: this.#runTimeoutMs,
                timeoutError: () =>
                  new AgentRunTimeoutError(run.definition.name, this.#runTimeoutMs),
                operation: async (signal) =>
                  await structuredModel.invoke(
                    [
                      new SystemMessage(run.definition.systemPrompt),
                      new HumanMessage(run.request.input),
                    ],
                    {
                      signal,
                      metadata: {
                        agentName: run.definition.name,
                        runId,
                        sessionId: run.request.sessionId,
                      },
                    },
                  ),
              });
              generationObservation.update({ output: response });
              return response;
            },
          );
        } catch (cause) {
          if (cause instanceof AgentRunTimeoutError) throw cause;
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

        const result = {
          status: "completed",
          agentName: run.definition.name,
          runId,
          sessionId: run.request.sessionId,
          runtime: "direct-model",
          output: validation.data,
          stepCount: 1,
          toolCalls: [],
          approvalDecisions: [],
          childRuns: [],
          startedAt,
          completedAt: this.#now().toISOString(),
        } as const;
        agentObservation.update({ output: validation.data, metadata: { stepCount: 1 } });
        return result;
      },
    );
  }
}
