import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import type { ModelConfig, ModelProviderName } from "../core/agent-definition.js";
import {
  ModelProviderAlreadyRegisteredError,
  ModelProviderNotRegisteredError,
} from "../core/errors.js";
import type { ModelProvider } from "./model-provider.js";

export class ModelProviderRegistry {
  readonly #providers = new Map<ModelProviderName, ModelProvider>();

  constructor(providers: readonly ModelProvider[] = []) {
    for (const provider of providers) {
      this.register(provider);
    }
  }

  register(provider: ModelProvider): void {
    if (this.#providers.has(provider.name)) {
      throw new ModelProviderAlreadyRegisteredError(provider.name);
    }

    this.#providers.set(provider.name, provider);
  }

  getProvider(name: ModelProviderName): ModelProvider {
    const provider = this.#providers.get(name);
    if (provider === undefined) {
      throw new ModelProviderNotRegisteredError(name);
    }

    return provider;
  }

  getModel(config: ModelConfig): BaseChatModel {
    return this.getProvider(config.provider).getModel(config);
  }
}
