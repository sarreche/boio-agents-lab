import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SystemMessage } from "@langchain/core/messages";
import type { ClientTool } from "@langchain/core/tools";
import type { RunnableConfig } from "@langchain/core/runnables";

import { AgentModelTimeoutError, GraphConfigurationError } from "../../core/errors.js";
import { executeWithDeadline } from "../../core/execution-deadline.js";
import { NoopTracer } from "../../observability/noop-tracer.js";
import type { Tracer } from "../../observability/tracer.js";
import type { AgentGraphStateUpdate, AgentGraphStateValue } from "../state.js";

export function createCallModelNode(options: {
  model: BaseChatModel;
  tools: readonly ClientTool[];
  systemPrompt: string;
  tracer?: Tracer;
  modelName?: string;
  modelParameters?: Readonly<Record<string, string | number>>;
  modelTimeoutMs?: number;
}) {
  if (options.model.bindTools === undefined) {
    throw new GraphConfigurationError("The selected model does not support tool binding.");
  }
  const modelWithTools = options.model.bindTools([...options.tools]);
  const tracer = options.tracer ?? new NoopTracer();

  const modelTimeoutMs = options.modelTimeoutMs ?? 60_000;

  return async (
    state: AgentGraphStateValue,
    config?: RunnableConfig,
  ): Promise<AgentGraphStateUpdate> => {
    const response = await tracer.observe(
      {
        name: `generation.${state.agentName}`,
        type: "generation",
        input: state.messages,
        model: options.modelName,
        modelParameters: options.modelParameters,
        metadata: {
          promptVersion: state.promptVersion,
          promptName: state.agentName,
          runId: state.runId,
          sessionId: state.sessionId,
          step: state.stepCount + 1,
        },
      },
      async (observation) => {
        const value = await executeWithDeadline({
          timeoutMs: modelTimeoutMs,
          parentSignal: config?.signal,
          timeoutError: () => new AgentModelTimeoutError(state.agentName, modelTimeoutMs),
          operation: async (signal) =>
            await modelWithTools.invoke(
              [new SystemMessage(options.systemPrompt), ...state.messages],
              { ...config, signal },
            ),
        });
        observation.update({ output: value });
        return value;
      },
    );
    return { messages: [response], stepCount: 1 };
  };
}
