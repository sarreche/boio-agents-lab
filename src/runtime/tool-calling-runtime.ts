import { randomUUID } from "node:crypto";

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { ClientTool } from "@langchain/core/tools";
import type { InteropZodType } from "@langchain/core/utils/types";
import {
  createAgent,
  modelCallLimitMiddleware,
  toolCallLimitMiddleware,
  type AnyAgentMiddleware,
} from "langchain";

import type {
  AgentRunResult,
  AgentRuntime,
  StructuredAgentRun,
  ToolCallRecord,
} from "../core/agent-runtime.js";
import {
  AgentApprovalNotSupportedError,
  AgentExecutionError,
  StructuredOutputValidationError,
} from "../core/errors.js";
import type { ModelProviderRegistry } from "../models/registry.js";
import type { ToolRegistry } from "../tools/registry.js";

export interface ToolCallingRuntimeDependencies {
  providers: ModelProviderRegistry;
  tools: ToolRegistry;
  createRunId?: () => string;
  now?: () => Date;
}

interface StructuredAgentRunner<TOutput extends Record<string, unknown>> {
  invoke(
    input: { messages: readonly [{ role: "user"; content: string }] },
    config?: RunnableConfig,
  ): Promise<{
    messages: BaseMessage[];
    structuredResponse: TOutput;
  }>;
}

type StructuredAgentFactory = <TOutput extends Record<string, unknown>>(options: {
  model: BaseChatModel;
  tools: ClientTool[];
  prompt: string;
  responseFormat: InteropZodType<TOutput, unknown>;
  middleware: readonly AnyAgentMiddleware[];
}) => StructuredAgentRunner<TOutput>;

// The public createAgent overloads lose the schema generic inside a generic adapter.
// This narrow boundary type states the exact overload used here without leaking casts downstream.
const createStructuredToolAgent = createAgent as unknown as StructuredAgentFactory;

/** Runs a tool-capable agent using LangChain's LangGraph-backed createAgent harness. */
export class ToolCallingRuntime implements AgentRuntime {
  readonly #providers: ModelProviderRegistry;
  readonly #tools: ToolRegistry;
  readonly #createRunId: () => string;
  readonly #now: () => Date;

  constructor(dependencies: ToolCallingRuntimeDependencies) {
    this.#providers = dependencies.providers;
    this.#tools = dependencies.tools;
    this.#createRunId = dependencies.createRunId ?? randomUUID;
    this.#now = dependencies.now ?? (() => new Date());
  }

  async runStructured<TOutput extends Record<string, unknown>>(
    run: StructuredAgentRun<TOutput>,
  ): Promise<AgentRunResult<TOutput>> {
    if (run.definition.approvalRequiredTools.length > 0) {
      throw new AgentApprovalNotSupportedError("langchain-agent");
    }

    const runId = this.#createRunId();
    const startedAt = this.#now().toISOString();
    const model = this.#providers.getModel(run.definition.model);
    const tools = this.#tools.toLangChainTools(run.definition.tools, {
      runId,
      sessionId: run.request.sessionId,
    });
    const agent = createStructuredToolAgent<TOutput>({
      model,
      tools,
      prompt: run.definition.systemPrompt,
      responseFormat: run.outputSchema,
      middleware: [
        modelCallLimitMiddleware({ runLimit: run.definition.maxSteps, exitBehavior: "error" }),
        toolCallLimitMiddleware({ runLimit: run.definition.maxSteps, exitBehavior: "error" }),
      ],
    });

    let result: Awaited<ReturnType<typeof agent.invoke>>;
    try {
      result = await agent.invoke(
        { messages: [{ role: "user", content: run.request.input }] },
        {
          recursionLimit: run.definition.maxSteps * 3 + 1,
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
      throw new AgentExecutionError(`Agent "${run.definition.name}" execution failed.`, { cause });
    }

    const validation = run.outputSchema.safeParse(result.structuredResponse);
    if (!validation.success) {
      throw new StructuredOutputValidationError(
        run.definition.name,
        validation.error.issues.map((issue) => issue.message),
        { cause: validation.error },
      );
    }

    const aiMessages = result.messages.filter((message) => AIMessage.isInstance(message));
    const toolCalls: ToolCallRecord[] = aiMessages.flatMap((message, messageIndex) =>
      (message.tool_calls ?? [])
        .filter((toolCall) => run.definition.tools.includes(toolCall.name))
        .map((toolCall, toolCallIndex) => ({
          name: toolCall.name,
          callId: toolCall.id ?? `${String(messageIndex)}-${String(toolCallIndex)}`,
          arguments: toolCall.args,
        })),
    );
    // ToolStrategy appends one synthetic AI confirmation after the terminal
    // structured-output tool call; it is state history, not a model invocation.
    const modelCallCount = Math.max(1, aiMessages.length - 1);

    return {
      status: "completed",
      agentName: run.definition.name,
      runId,
      sessionId: run.request.sessionId,
      runtime: "langchain-agent",
      output: validation.data,
      stepCount: modelCallCount,
      toolCalls,
      approvalDecisions: [],
      startedAt,
      completedAt: this.#now().toISOString(),
    };
  }
}
