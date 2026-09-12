import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SystemMessage } from "@langchain/core/messages";
import type { ClientTool } from "@langchain/core/tools";

import { GraphConfigurationError } from "../../core/errors.js";
import type { AgentGraphStateUpdate, AgentGraphStateValue } from "../state.js";

export function createCallModelNode(options: {
  model: BaseChatModel;
  tools: readonly ClientTool[];
  systemPrompt: string;
}) {
  if (options.model.bindTools === undefined) {
    throw new GraphConfigurationError("The selected model does not support tool binding.");
  }
  const modelWithTools = options.model.bindTools([...options.tools]);

  return async (state: AgentGraphStateValue): Promise<AgentGraphStateUpdate> => {
    const response = await modelWithTools.invoke([
      new SystemMessage(options.systemPrompt),
      ...state.messages,
    ]);
    return { messages: [response], stepCount: 1 };
  };
}
