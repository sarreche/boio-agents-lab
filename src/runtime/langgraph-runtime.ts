import { randomUUID } from "node:crypto";

import { HumanMessage } from "@langchain/core/messages";
import {
  Command,
  INTERRUPT,
  MemorySaver,
  isInterrupted,
  type BaseCheckpointSaver,
} from "@langchain/langgraph";

import type {
  AgentRunOutcome,
  AgentRunResult,
  AgentRuntime,
  StructuredAgentResume,
  StructuredAgentRun,
} from "../core/agent-runtime.js";
import {
  AgentExecutionError,
  AgentSessionAlreadyExistsError,
  AgentSessionMismatchError,
  AgentSessionNotFoundError,
  AgentSessionNotInterruptedError,
  GraphConfigurationError,
  SessionIdRequiredError,
} from "../core/errors.js";
import { createAgentGraph } from "../graph/create-agent-graph.js";
import { AGENT_GRAPH_STATE_VERSION, type AgentGraphStateValue } from "../graph/state.js";
import type { ModelProviderRegistry } from "../models/registry.js";
import type { ToolRegistry } from "../tools/registry.js";

export interface LangGraphRuntimeDependencies {
  providers: ModelProviderRegistry;
  tools: ToolRegistry;
  checkpointer?: BaseCheckpointSaver;
  modelRetryMaxAttempts?: number;
  createRunId?: () => string;
  now?: () => Date;
}

type GraphRun<TOutput extends Record<string, unknown>> =
  StructuredAgentRun<TOutput> | StructuredAgentResume<TOutput>;

/** Executes and resumes definitions through the project-owned explicit StateGraph. */
export class LangGraphRuntime implements AgentRuntime {
  readonly #providers: ModelProviderRegistry;
  readonly #tools: ToolRegistry;
  readonly #checkpointer: BaseCheckpointSaver;
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
    this.#checkpointer = dependencies.checkpointer ?? new MemorySaver();
    this.#modelRetryMaxAttempts = modelRetryMaxAttempts;
    this.#createRunId = dependencies.createRunId ?? randomUUID;
    this.#now = dependencies.now ?? (() => new Date());
  }

  async runStructured<TOutput extends Record<string, unknown>>(
    run: StructuredAgentRun<TOutput>,
  ): Promise<AgentRunOutcome<TOutput>> {
    if (run.definition.approvalRequiredTools.length > 0 && run.request.sessionId === undefined) {
      throw new SessionIdRequiredError("run");
    }

    const runId = this.#createRunId();
    const startedAt = this.#now().toISOString();
    const threadId = run.request.sessionId ?? runId;
    const graph = this.#createGraph(run);
    const config = this.#createConfig(run, threadId, runId);

    if (run.request.sessionId !== undefined) {
      const snapshot = await graph.getState(config);
      const savedState = snapshot.values as Partial<AgentGraphStateValue>;
      if (savedState.runId !== undefined) {
        throw new AgentSessionAlreadyExistsError(run.request.sessionId);
      }
    }

    let state;
    try {
      state = await graph.invoke(
        {
          schemaVersion: AGENT_GRAPH_STATE_VERSION,
          agentName: run.definition.name,
          runId,
          startedAt,
          sessionId: run.request.sessionId,
          promptVersion: run.definition.promptVersion,
          messages: [new HumanMessage(run.request.input)],
          stepCount: 0,
          toolCalls: [],
          toolResults: [],
          errors: [],
          approvalDecisions: [],
          status: "running",
        },
        config,
      );
    } catch (cause) {
      throw new AgentExecutionError(`Agent "${run.definition.name}" graph execution failed.`, {
        cause,
      });
    }

    return this.#toOutcome(run, state);
  }

  async resumeStructured<TOutput extends Record<string, unknown>>(
    resume: StructuredAgentResume<TOutput>,
  ): Promise<AgentRunOutcome<TOutput>> {
    if (resume.request.sessionId.trim() === "") {
      throw new SessionIdRequiredError("resume");
    }

    const graph = this.#createGraph(resume);
    const config = this.#createConfig(resume, resume.request.sessionId);
    const snapshot = await graph.getState(config);
    const savedState = snapshot.values as Partial<AgentGraphStateValue>;
    if (savedState.runId === undefined || savedState.agentName === undefined) {
      throw new AgentSessionNotFoundError(resume.request.sessionId);
    }
    if (savedState.agentName !== resume.definition.name) {
      throw new AgentSessionMismatchError(
        resume.request.sessionId,
        resume.definition.name,
        savedState.agentName,
      );
    }
    const hasPendingInterrupt = snapshot.tasks.some((task) => task.interrupts.length > 0);
    if (snapshot.next.length === 0 && !hasPendingInterrupt) {
      throw new AgentSessionNotInterruptedError(resume.request.sessionId);
    }

    let state;
    try {
      state = await graph.invoke(new Command({ resume: resume.request.value }), {
        ...config,
        metadata: {
          ...config.metadata,
          ...resume.request.metadata,
          runId: savedState.runId,
          resumed: true,
        },
      });
    } catch (cause) {
      throw new AgentExecutionError(`Agent "${resume.definition.name}" resume failed.`, { cause });
    }

    return this.#toOutcome(resume, state);
  }

  #createGraph<TOutput extends Record<string, unknown>>(run: GraphRun<TOutput>) {
    return createAgentGraph({
      definition: run.definition,
      outputSchema: run.outputSchema,
      model: this.#providers.getModel(run.definition.model),
      tools: this.#tools,
      modelRetryMaxAttempts: this.#modelRetryMaxAttempts,
      checkpointer: this.#checkpointer,
      now: this.#now,
    });
  }

  #createConfig<TOutput extends Record<string, unknown>>(
    run: GraphRun<TOutput>,
    threadId: string,
    runId?: string,
  ) {
    return {
      recursionLimit: run.definition.maxSteps * 4 + 6,
      configurable: { thread_id: threadId },
      metadata: {
        ...run.request.metadata,
        agentName: run.definition.name,
        model: run.definition.model.model,
        promptVersion: run.definition.promptVersion,
        provider: run.definition.model.provider,
        runId,
        sessionId: run.request.sessionId,
      },
    };
  }

  async #toOutcome<TOutput extends Record<string, unknown>>(
    run: GraphRun<TOutput>,
    state: AgentGraphStateValue & Record<string, unknown>,
  ): Promise<AgentRunOutcome<TOutput>> {
    if (isInterrupted(state)) {
      if (state.sessionId === undefined) {
        throw new SessionIdRequiredError("resume");
      }
      return {
        status: "interrupted",
        agentName: state.agentName,
        runId: state.runId,
        sessionId: state.sessionId,
        runtime: "langgraph-explicit",
        interrupts: state[INTERRUPT].map((item, index) => ({
          id: item.id ?? `${state.runId}-${String(index)}`,
          value: item.value,
        })),
        stepCount: state.stepCount,
        toolCalls: state.toolCalls,
        approvalDecisions: state.approvalDecisions,
        startedAt: state.startedAt,
        interruptedAt: this.#now().toISOString(),
      };
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

    const result: AgentRunResult<TOutput> = {
      status: "completed",
      agentName: state.agentName,
      runId: state.runId,
      sessionId: state.sessionId,
      runtime: "langgraph-explicit",
      output: outputValidation.data,
      stepCount: state.stepCount,
      toolCalls: state.toolCalls,
      approvalDecisions: state.approvalDecisions,
      startedAt: state.startedAt,
      completedAt: this.#now().toISOString(),
    };
    return result;
  }
}
