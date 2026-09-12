import { FakeToolCallingModel } from "langchain";
import { z } from "zod";

import { defineAgent } from "../src/core/agent-definition.js";
import { createStructuredAgent } from "../src/core/agent-runtime.js";
import { ModelProviderRegistry } from "../src/models/registry.js";
import { StaticModelProvider } from "../src/models/static-model-provider.js";
import { LangGraphRuntime } from "../src/runtime/langgraph-runtime.js";
import { ToolRegistry } from "../src/tools/registry.js";
import { defineTool } from "../src/tools/tool.js";

const publishDraft = defineTool({
  name: "publish_draft",
  description: "Publishes a draft after a human approves the proposed effect.",
  inputSchema: z.object({ text: z.string().min(1) }),
  outputSchema: z.object({ published: z.boolean() }),
  execute: ({ text }) => {
    console.log(`Effect executed: published "${text}"`);
    return { published: true };
  },
});

const definition = defineAgent({
  name: "publisher",
  description: "Demonstrates a guarded side effect.",
  systemPrompt: "Publish the requested text, then return a structured confirmation.",
  model: { provider: "openrouter", model: "fake-tool-model", temperature: 0 },
  tools: ["publish_draft"],
  approvalRequiredTools: ["publish_draft"],
  maxSteps: 3,
});

const model = new FakeToolCallingModel({
  toolCalls: [
    [{ name: "publish_draft", args: { text: "Hello from MiniAgents" }, id: "publish-1" }],
    [{ name: "publisher_output", args: { message: "Draft published." }, id: "output-1" }],
  ],
});
const runtime = new LangGraphRuntime({
  providers: new ModelProviderRegistry([new StaticModelProvider("openrouter", model)]),
  tools: new ToolRegistry([publishDraft]),
});
const publisher = createStructuredAgent({
  definition,
  outputSchema: z.object({ message: z.string() }),
  runtime,
});

const sessionId = "hitl-example-session";
const paused = await publisher.run({ input: "Publish the greeting.", sessionId });
if (paused.status !== "interrupted") {
  throw new Error("Expected the guarded tool call to pause.");
}

console.log("Approval requested:", JSON.stringify(paused.interrupts[0]?.value, null, 2));
const completed = await publisher.resume({
  sessionId,
  value: { decision: "approve", actor: "example-reviewer" },
});
if (completed.status !== "completed") {
  throw new Error("Expected the approved run to complete.");
}

console.log("Final output:", completed.output);
console.log("Approval audit:", completed.approvalDecisions);
