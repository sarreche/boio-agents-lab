import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import type { ModelConfig, ModelProviderName } from "../core/agent-definition.js";

/** Adapter boundary for constructing LangChain chat models from serializable configuration. */
export interface ModelProvider {
  readonly name: ModelProviderName;
  getModel(config: ModelConfig): BaseChatModel;
}
