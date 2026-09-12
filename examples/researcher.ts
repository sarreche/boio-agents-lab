import { FakeToolCallingModel } from "langchain";

import { createResearcher } from "../src/agents/researcher.js";
import { ModelProviderRegistry } from "../src/models/registry.js";
import { StaticModelProvider } from "../src/models/static-model-provider.js";
import { ToolCallingRuntime } from "../src/runtime/tool-calling-runtime.js";
import { createMockSearchTool } from "../src/tools/builtins/mock-search.js";
import { ToolRegistry } from "../src/tools/registry.js";

const structuredAnswer = {
  answer:
    "Explicit state makes each transition inspectable and enables reliable checkpoint-based resume.",
  sources: [{ title: "Explicit agent state", url: "https://example.test/agent-state" }],
  researchPerformed: true,
};

const model = new FakeToolCallingModel({
  toolCalls: [
    [
      {
        name: "mock_search",
        args: { query: "benefits of explicit agent state", limit: 3 },
        id: "search-call",
      },
    ],
    [{ name: "researcher_output", args: structuredAnswer, id: "final-output" }],
  ],
});

const providers = new ModelProviderRegistry([new StaticModelProvider("openrouter", model)]);
const tools = new ToolRegistry([
  createMockSearchTool([
    {
      title: "Explicit agent state",
      url: "https://example.test/agent-state",
      content:
        "Explicit state makes transitions inspectable and enables checkpoint-based resume and debugging.",
    },
  ]),
]);
const runtime = new ToolCallingRuntime({ providers, tools });
const researcher = createResearcher({
  model: { provider: "openrouter", model: "deterministic-tool-fake", temperature: 0 },
  runtime,
});

const result = await researcher.run({
  input: "Why is explicit state useful in an agent runtime?",
  sessionId: "research-example",
});

console.log(JSON.stringify(result, null, 2));
