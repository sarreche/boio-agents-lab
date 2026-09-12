import { randomUUID } from "node:crypto";

import { HumanMessage } from "@langchain/core/messages";

import type { AgentRunResult, AgentRuntime, StructuredAgentRun } from "../core/agent-runtime.js";
import { AgentExecutionError, GraphConfigurationError } from "../core/errors.js";
import { createAgentGraph } from "../graph/create-agent-graph.js";
import { AGENT_GRAPH_STATE_VERSION } from "../graph/state.js";
import type { ModelProviderRegistry } from "../models/registry.js";
import type { ToolRegistry } from "../tools/registry.js";

export interface LangGraphRuntimeDependencies {
  providers: ModelProviderRegistry;
  tools: ToolRegistry;
  modelRetryMaxAttempts?: number;
  createRunId?: () => string;
  now?: () => Date;
}

/** Executes definitions through the project-owned, explicit StateGraph. */
export class LangGraphRuntime implements AgentRuntime {
  readonly #providers: ModelProviderRegistry;
  readonly #tools: ToolRegistry;
  readonly #modelRetryMaxAttempts: number;
  readonly #createRunId: () => string;
  readonly #now: () => Date;

  constructor(dependencies: LangGraphRuntimeDependencies) {
    const modelRetryMaxAttempts = dependencies.modelRetryMaxAttempts ?? 3;
    if (!Number.isInteger(modelRetryMaxAttempts) || modelRetryMaxAttempts < 1) {
      throw new GraphConfigurationError("modelRetryMaxAttempts must be a positive integer.");
    }

    this.#providers = dependencies.providers;
    this.#tools = dependencies.tools;
    this.#modelRetryMaxAttempts = modelRetryMaxAttempts;
    this.#createRunId = dependencies.createRunId ?? randomUUID;
    this.#now = dependencies.now ?? (() => new Date());
  }

  async runStructured<TOutput extends Record<string, unknown>>(
    run: StructuredAgentRun<TOutput>,
  ): Promise<AgentRunResult<TOutput>> {
    const runId = this.#createRunId();
    const startedAt = this.#now().toISOString();
    const graph = createAgentGraph({
      definition: run.definition,
      outputSchema: run.outputSchema,
      model: this.#providers.getModel(run.definition.model),
      tools: this.#tools,
      modelRetryMaxAttempts: this.#modelRetryMaxAttempts,
    });

    let state;
    try {
      state = await graph.invoke(
        {
          schemaVersion: AGENT_GRAPH_STATE_VERSION,
          agentName: run.definition.name,
          runId,
          sessionId: run.request.sessionId,
          promptVersion: run.definition.promptVersion,
          messages: [new HumanMessage(run.request.input)],
          stepCount: 0,
          toolCalls: [],
          toolResults: [],
          errors: [],
          status: "running",
        },
        {
          recursionLimit: run.definition.maxSteps * 3 + 4,
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
      throw new AgentExecutionError(`Agent "${run.definition.name}" graph execution failed.`, {
        cause,
      });
    }

    if (state.status !== "completed") {
      throw new AgentExecutionError(
        state.failureReason ?? `Agent "${run.definition.name}" graph ended without output.`,
        { cause: state.errors.at(-1) },
      );
    }

    const outputValidation = await run.outputSchema.safeParseAsync(state.finalOutput);
    if (!outputValidation.success) {
      throw new AgentExecutionError(`Agent "${run.definition.name}" graph output was invalid.`, {
        cause: outputValidation.error,
      });
    }

    return {
      agentName: run.definition.name,
      runId,
      sessionId: run.request.sessionId,
      runtime: "langgraph-explicit",
      output: outputValidation.data,
      stepCount: state.stepCount,
      toolCalls: state.toolCalls,
      startedAt,
      completedAt: this.#now().toISOString(),
    };
  }
}
