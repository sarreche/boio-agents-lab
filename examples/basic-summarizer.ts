import { fakeModel } from "@langchain/core/testing";

import { createSummarizer } from "../src/agents/summarizer.js";
import { ModelProviderRegistry } from "../src/models/registry.js";
import { StaticModelProvider } from "../src/models/static-model-provider.js";
import { DirectModelRuntime } from "../src/runtime/direct-model-runtime.js";

const model = fakeModel().structuredResponse({
  summary: "MiniAgents favors explicit architecture so agent behavior remains understandable.",
  keyPoints: ["Explicit state and control flow", "Replaceable infrastructure adapters"],
});

const providers = new ModelProviderRegistry([new StaticModelProvider("openrouter", model)]);
const runtime = new DirectModelRuntime({ providers });
const summarizer = createSummarizer({
  model: { provider: "openrouter", model: "deterministic-fake", temperature: 0 },
  runtime,
});

const result = await summarizer.run({
  input:
    "MiniAgents keeps state and control flow explicit. Providers and persistence are replaceable adapters.",
  sessionId: "example-session",
});

console.log(JSON.stringify(result, null, 2));
