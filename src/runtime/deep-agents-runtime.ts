import { randomUUID } from "node:crypto";

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { ClientTool } from "@langchain/core/tools";
import {
  createDeepAgent,
  registerHarnessProfile,
  type HarnessProfileOptions,
  type SupportedResponseFormat,
} from "deepagents";
import { createMiddleware, modelCallLimitMiddleware, toolCallLimitMiddleware } from "langchain";

import type {
  AgentRunResult,
  AgentRuntime,
  StructuredAgentRun,
  StructuredOutputSchema,
  ToolCallRecord,
} from "../core/agent-runtime.js";
import { executeWithDeadline } from "../core/execution-deadline.js";
import {
  AgentApprovalNotSupportedError,
  AgentDelegationNotSupportedError,
  AgentExecutionError,
  AgentRunTimeoutError,
  StructuredOutputValidationError,
  ToolNotAuthorizedError,
} from "../core/errors.js";
import type { ModelProviderRegistry } from "../models/registry.js";
import { NoopTracer } from "../observability/noop-tracer.js";
import type { Tracer } from "../observability/tracer.js";
import type { ToolRegistry } from "../tools/registry.js";

const IMPLICIT_DEEP_AGENT_TOOLS = [
  "ls",
  "read_file",
  "write_file",
  "edit_file",
  "delete",
  "glob",
  "grep",
  "execute",
  "task",
  "start_async_task",
  "check_async_task",
  "update_async_task",
  "cancel_async_task",
  "list_async_tasks",
  "write_todos",
] as const;
const IMPLICIT_DEEP_AGENT_TOOL_SET = new Set<string>(IMPLICIT_DEEP_AGENT_TOOLS);

function createImplicitToolGuard() {
  return createMiddleware({
    name: "MiniAgentsImplicitToolGuard",
    wrapModelCall: (request, handler) =>
      handler({
        ...request,
        tools: request.tools.filter(
          (tool) => typeof tool.name !== "string" || !IMPLICIT_DEEP_AGENT_TOOL_SET.has(tool.name),
        ),
      }),
    wrapToolCall: (request, handler) => {
      if (IMPLICIT_DEEP_AGENT_TOOL_SET.has(request.toolCall.name)) {
        throw new ToolNotAuthorizedError(request.toolCall.name);
      }
      return handler(request);
    },
  });
}

interface DeepAgentRunner<TOutput extends Record<string, unknown>> {
  invoke(
    input: { messages: readonly [{ role: "user"; content: string }] },
    config?: RunnableConfig,
  ): Promise<{ messages: BaseMessage[]; structuredResponse: TOutput }>;
}

export interface DeepAgentFactoryOptions<TOutput extends Record<string, unknown>> {
  name: string;
  model: BaseChatModel;
  tools: ClientTool[];
  systemPrompt: string;
  responseFormat: StructuredOutputSchema<TOutput>;
  maxSteps: number;
}

export type DeepAgentFactory = <TOutput extends Record<string, unknown>>(
  options: DeepAgentFactoryOptions<TOutput>,
) => DeepAgentRunner<TOutput>;

export type HarnessProfileRegistrar = (provider: string, profile: HarnessProfileOptions) => void;

const defaultFactory: DeepAgentFactory = <TOutput extends Record<string, unknown>>(
  options: DeepAgentFactoryOptions<TOutput>,
) =>
  createDeepAgent({
    name: options.name,
    model: options.model,
    tools: options.tools,
    systemPrompt: options.systemPrompt,
    responseFormat: options.responseFormat as unknown as SupportedResponseFormat,
    permissions: [{ operations: ["read", "write"], paths: ["/**"], mode: "deny" }],
    middleware: [
      createImplicitToolGuard(),
      modelCallLimitMiddleware({ runLimit: options.maxSteps, exitBehavior: "error" }),
      toolCallLimitMiddleware({ runLimit: options.maxSteps, exitBehavior: "error" }),
    ],
  }) as unknown as DeepAgentRunner<TOutput>;

export interface DeepAgentsRuntimeDependencies {
  providers: ModelProviderRegistry;
  tools: ToolRegistry;
  tracer?: Tracer;
  createRunId?: () => string;
  now?: () => Date;
  createDeepAgent?: DeepAgentFactory;
  registerHarnessProfile?: HarnessProfileRegistrar;
  runTimeoutMs?: number;
}

/** Adapts the opinionated Deep Agents harness to the MiniAgents runtime contract. */
export class DeepAgentsRuntime implements AgentRuntime {
  readonly #providers: ModelProviderRegistry;
  readonly #tools: ToolRegistry;
  readonly #tracer: Tracer;
  readonly #createRunId: () => string;
  readonly #now: () => Date;
  readonly #createDeepAgent: DeepAgentFactory;
  readonly #registerHarnessProfile: HarnessProfileRegistrar;
  readonly #runTimeoutMs: number;

  constructor(dependencies: DeepAgentsRuntimeDependencies) {
    this.#providers = dependencies.providers;
    this.#tools = dependencies.tools;
    this.#tracer = dependencies.tracer ?? new NoopTracer();
    this.#createRunId = dependencies.createRunId ?? randomUUID;
    this.#now = dependencies.now ?? (() => new Date());
    this.#createDeepAgent = dependencies.createDeepAgent ?? defaultFactory;
    this.#registerHarnessProfile = dependencies.registerHarnessProfile ?? registerHarnessProfile;
    this.#runTimeoutMs = dependencies.runTimeoutMs ?? 300_000;
  }

  async runStructured<TOutput extends Record<string, unknown>>(
    run: StructuredAgentRun<TOutput>,
  ): Promise<AgentRunResult<TOutput>> {
    if (run.definition.approvalRequiredTools.length > 0) {
      throw new AgentApprovalNotSupportedError("deep-agents");
    }
    if (run.definition.subagents.length > 0) {
      throw new AgentDelegationNotSupportedError("deep-agents");
    }

    const runId = this.#createRunId();
    const startedAt = this.#now().toISOString();
    this.#registerHarnessProfile(run.definition.model.provider, {
      excludedTools: [...IMPLICIT_DEEP_AGENT_TOOLS],
      generalPurposeSubagent: { enabled: false },
    });
    const agent = this.#createDeepAgent<TOutput>({
      name: run.definition.name,
      model: this.#providers.getModel(run.definition.model),
      tools: this.#tools.toLangChainTools(
        run.definition.tools,
        { runId, sessionId: run.request.sessionId },
        this.#tracer,
      ),
      systemPrompt: run.definition.systemPrompt,
      responseFormat: run.outputSchema,
      maxSteps: run.definition.maxSteps,
    });

    return this.#tracer.observe(
      {
        name: `agent.${run.definition.name}`,
        type: "agent",
        input: run.request.input,
        metadata: {
          agentName: run.definition.name,
          harness: "deep-agents",
          parentRunId: run.request.lineage?.parentRunId,
          promptName: run.definition.name,
          promptVersion: run.definition.promptVersion,
          provider: run.definition.model.provider,
          runId,
          sessionId: run.request.sessionId,
        },
      },
      async (observation) => {
        let state: Awaited<ReturnType<typeof agent.invoke>>;
        try {
          state = await executeWithDeadline({
            timeoutMs: this.#runTimeoutMs,
            timeoutError: () => new AgentRunTimeoutError(run.definition.name, this.#runTimeoutMs),
            operation: async (signal) =>
              await agent.invoke(
                { messages: [{ role: "user", content: run.request.input }] },
                {
                  signal,
                  recursionLimit: run.definition.maxSteps * 4 + 10,
                  metadata: {
                    ...run.request.metadata,
                    agentName: run.definition.name,
                    promptVersion: run.definition.promptVersion,
                    runId,
                    sessionId: run.request.sessionId,
                  },
                },
              ),
          });
        } catch (cause) {
          if (cause instanceof AgentRunTimeoutError) throw cause;
          throw new AgentExecutionError(
            `Agent "${run.definition.name}" Deep Agents execution failed.`,
            { cause },
          );
        }

        const validation = await run.outputSchema.safeParseAsync(state.structuredResponse);
        if (!validation.success) {
          throw new StructuredOutputValidationError(
            run.definition.name,
            validation.error.issues.map((issue) => issue.message),
            { cause: validation.error },
          );
        }
        const aiMessages = state.messages.filter((message) => AIMessage.isInstance(message));
        const toolCalls: ToolCallRecord[] = aiMessages.flatMap((message, messageIndex) =>
          (message.tool_calls ?? [])
            .filter((call) => run.definition.tools.includes(call.name))
            .map((call, callIndex) => ({
              name: call.name,
              callId: call.id ?? `${String(messageIndex)}-${String(callIndex)}`,
              arguments: call.args,
            })),
        );
        const result = {
          status: "completed",
          agentName: run.definition.name,
          runId,
          sessionId: run.request.sessionId,
          runtime: "deep-agents",
          output: validation.data,
          stepCount: Math.max(1, aiMessages.length - 1),
          toolCalls,
          approvalDecisions: [],
          childRuns: [],
          startedAt,
          completedAt: this.#now().toISOString(),
        } as const;
        observation.update({
          output: validation.data,
          metadata: { stepCount: result.stepCount },
        });
        return result;
      },
    );
  }
}
