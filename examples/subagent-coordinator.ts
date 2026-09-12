import { fakeModel } from "@langchain/core/testing";
import { FakeToolCallingModel } from "langchain";
import { z } from "zod";

import { defineAgent } from "../src/core/agent-definition.js";
import { createStructuredAgent } from "../src/core/agent-runtime.js";
import { ModelProviderRegistry } from "../src/models/registry.js";
import { StaticModelProvider } from "../src/models/static-model-provider.js";
import { DirectModelRuntime } from "../src/runtime/direct-model-runtime.js";
import { LangGraphRuntime } from "../src/runtime/langgraph-runtime.js";
import { SubagentCoordinator } from "../src/subagents/coordinator.js";
import { SubagentRegistry } from "../src/subagents/registry.js";
import { ToolRegistry } from "../src/tools/registry.js";

const specialistDefinition = defineAgent({
  name: "specialist",
  description: "Analyzes one isolated question and returns a concise finding.",
  systemPrompt: "Return one concise finding about the supplied question.",
  model: { provider: "openai", model: "fake-specialist", temperature: 0 },
});
const specialist = createStructuredAgent({
  definition: specialistDefinition,
  outputSchema: z.object({ finding: z.string() }),
  runtime: new DirectModelRuntime({
    providers: new ModelProviderRegistry([
      new StaticModelProvider(
        "openai",
        fakeModel().structuredResponse({
          finding: "The child received only the delegated task, not the parent message history.",
        }),
      ),
    ]),
  }),
});

const registry = new SubagentRegistry();
registry.register(specialist);
const supervisorModel = new FakeToolCallingModel({
  toolCalls: [
    [
      {
        name: "delegate_agent",
        args: { agentName: "specialist", task: "Explain subagent context isolation." },
        id: "delegate-1",
      },
    ],
    [
      {
        name: "supervisor_output",
        args: { answer: "Delegation isolates context and returns a structured child result." },
        id: "output-1",
      },
    ],
  ],
});
const supervisor = createStructuredAgent({
  definition: defineAgent({
    name: "supervisor",
    description: "Coordinates specialist agents.",
    systemPrompt: "Delegate specialist analysis, then synthesize the returned result.",
    model: { provider: "openrouter", model: "fake-supervisor", temperature: 0 },
    subagents: ["specialist"],
    maxSteps: 3,
    maxSubagentDepth: 2,
  }),
  outputSchema: z.object({ answer: z.string() }),
  runtime: new LangGraphRuntime({
    providers: new ModelProviderRegistry([new StaticModelProvider("openrouter", supervisorModel)]),
    tools: new ToolRegistry(),
    subagents: new SubagentCoordinator(registry),
  }),
});

const result = await supervisor.run({ input: "Teach me why subagents isolate context." });
console.log(JSON.stringify(result, null, 2));
