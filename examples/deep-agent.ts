import { FakeToolCallingModel } from "langchain";

import { createResearcher } from "../src/agents/researcher.js";
import { ModelProviderRegistry } from "../src/models/registry.js";
import { StaticModelProvider } from "../src/models/static-model-provider.js";
import { DeepAgentsRuntime } from "../src/runtime/deep-agents-runtime.js";
import { createMockSearchTool } from "../src/tools/builtins/mock-search.js";
import { ToolRegistry } from "../src/tools/registry.js";

const output = {
  answer: "The harness supplies orchestration defaults behind the same project-owned contract.",
  sources: [{ title: "Agent harness", url: "https://example.test/agent-harness" }],
  researchPerformed: true,
};
const model = new FakeToolCallingModel({
  toolCalls: [
    [{ name: "mock_search", args: { query: "agent harness defaults" }, id: "search-1" }],
    [{ name: "researcher_output", args: output, id: "output-1" }],
  ],
});
const providers = new ModelProviderRegistry([new StaticModelProvider("openrouter", model)]);
const tools = new ToolRegistry([
  createMockSearchTool([
    {
      title: "Agent harness",
      url: "https://example.test/agent-harness",
      content: "A harness supplies reusable orchestration defaults around a model and tools.",
    },
  ]),
]);
const researcher = createResearcher({
  model: { provider: "openrouter", model: "deterministic-deep-agent-fake", temperature: 0 },
  runtime: new DeepAgentsRuntime({ providers, tools }),
});

const result = await researcher.run({ input: "What does an agent harness provide?" });

console.log(JSON.stringify(result, null, 2));
