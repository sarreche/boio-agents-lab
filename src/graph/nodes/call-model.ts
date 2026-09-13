import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SystemMessage } from "@langchain/core/messages";
import type { ClientTool } from "@langchain/core/tools";

import { GraphConfigurationError } from "../../core/errors.js";
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
}) {
  if (options.model.bindTools === undefined) {
    throw new GraphConfigurationError("The selected model does not support tool binding.");
  }
  const modelWithTools = options.model.bindTools([...options.tools]);
  const tracer = options.tracer ?? new NoopTracer();

  return async (state: AgentGraphStateValue): Promise<AgentGraphStateUpdate> => {
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
        const value = await modelWithTools.invoke([
          new SystemMessage(options.systemPrompt),
          ...state.messages,
        ]);
        observation.update({ output: value });
        return value;
      },
    );
    return { messages: [response], stepCount: 1 };
  };
}
