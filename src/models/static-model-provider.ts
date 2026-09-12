import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import type { ModelConfig, ModelProviderName } from "../core/agent-definition.js";
import type { ModelProvider } from "./model-provider.js";

/**
 * Supplies one prebuilt model. Useful for deterministic examples and tests where
 * constructing a real provider would add credentials or network access.
 */
export class StaticModelProvider implements ModelProvider {
  constructor(
    readonly name: ModelProviderName,
    readonly model: BaseChatModel,
  ) {}

  getModel(_config: ModelConfig): BaseChatModel {
    return this.model;
  }
}
