import { fakeModel } from "@langchain/core/testing";
import { describe, expect, it } from "vitest";

import {
  ModelProviderAlreadyRegisteredError,
  ModelProviderNotRegisteredError,
} from "../../src/core/errors.js";
import { ModelProviderRegistry } from "../../src/models/registry.js";
import { StaticModelProvider } from "../../src/models/static-model-provider.js";

describe("ModelProviderRegistry", () => {
  it("resolves a model through its configured provider", () => {
    const model = fakeModel();
    const registry = new ModelProviderRegistry([new StaticModelProvider("openrouter", model)]);

    expect(registry.getModel({ provider: "openrouter", model: "fake-model", temperature: 0 })).toBe(
      model,
    );
  });

  it("rejects duplicate provider registration", () => {
    const registry = new ModelProviderRegistry([new StaticModelProvider("openai", fakeModel())]);

    expect(() => {
      registry.register(new StaticModelProvider("openai", fakeModel()));
    }).toThrow(ModelProviderAlreadyRegisteredError);
  });

  it("fails explicitly when a provider is unavailable", () => {
    const registry = new ModelProviderRegistry();

    expect(() =>
      registry.getModel({ provider: "gemini", model: "fake-model", temperature: 0 }),
    ).toThrow(ModelProviderNotRegisteredError);
  });
});
