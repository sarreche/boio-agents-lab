import { FakeToolCallingModel } from "langchain";

import { createResearcher } from "../src/agents/researcher.js";
import { ModelProviderRegistry } from "../src/models/registry.js";
import { StaticModelProvider } from "../src/models/static-model-provider.js";
import { LangGraphRuntime } from "../src/runtime/langgraph-runtime.js";
import { createMockSearchTool } from "../src/tools/builtins/mock-search.js";
import { ToolRegistry } from "../src/tools/registry.js";

const output = {
  answer: "Explicit nodes make model calls, effects, routing, and termination inspectable.",
  sources: [{ title: "Explicit graphs", url: "https://example.test/explicit-graphs" }],
  researchPerformed: true,
};

const model = new FakeToolCallingModel({
  toolCalls: [
    [
      {
        name: "mock_search",
        args: { query: "explicit agent graphs", limit: 2 },
        id: "search-1",
      },
    ],
    [{ name: "researcher_output", args: output, id: "output-1" }],
  ],
});
const providers = new ModelProviderRegistry([new StaticModelProvider("openrouter", model)]);
const tools = new ToolRegistry([
  createMockSearchTool([
    {
      title: "Explicit graphs",
      url: "https://example.test/explicit-graphs",
      content: "Named nodes make model calls, effects, routing, and termination inspectable.",
    },
  ]),
]);
const researcher = createResearcher({
  model: { provider: "openrouter", model: "deterministic-tool-fake", temperature: 0 },
  runtime: new LangGraphRuntime({ providers, tools }),
});

const result = await researcher.run({
  input: "Why use an explicit graph for an agent?",
  sessionId: "explicit-graph-example",
});

console.log(JSON.stringify(result, null, 2));
