import { fakeModel } from "@langchain/core/testing";

import { createSummarizer } from "../src/agents/summarizer.js";
import { HttpAgentRegistry } from "../src/api/agent-registry.js";
import { createHttpApi } from "../src/api/http-api.js";
import { ModelProviderRegistry } from "../src/models/registry.js";
import { StaticModelProvider } from "../src/models/static-model-provider.js";
import { DirectModelRuntime } from "../src/runtime/direct-model-runtime.js";

const model = fakeModel().structuredResponse({
  summary: "The HTTP adapter exposes only registered agents.",
  keyPoints: ["Zod validates requests", "Runs are queryable by ID"],
});
const providers = new ModelProviderRegistry([new StaticModelProvider("openrouter", model)]);
const summarizer = createSummarizer({
  model: { provider: "openrouter", model: "deterministic-fake", temperature: 0 },
  runtime: new DirectModelRuntime({
    providers,
    createRunId: () => "http-example-run",
  }),
});
const api = createHttpApi({
  agents: new HttpAgentRegistry().register(summarizer),
});

// inject() exercises the complete HTTP boundary without opening a network socket.
const run = await api.inject({
  method: "POST",
  url: "/agents/summarizer/run",
  payload: { input: "MiniAgents keeps its HTTP transport thin." },
});
console.log(run.body);

const lookup = await api.inject({
  method: "GET",
  url: "/runs/http-example-run",
});
console.log(lookup.body);

await api.close();
