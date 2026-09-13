import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import type { BaseMessage } from "@langchain/core/messages";
import { RunnableBinding, RunnableLambda, type RunnableConfig } from "@langchain/core/runnables";
import type { StructuredTool } from "@langchain/core/tools";
import { FakeToolCallingModel } from "langchain";
import { describe, expect, it } from "vitest";

import { createResearcherDefinition, researcherOutputSchema } from "../../src/agents/researcher.js";
import { createStructuredAgent } from "../../src/core/agent-runtime.js";
import {
  AgentExecutionError,
  AgentModelTimeoutError,
  GraphConfigurationError,
} from "../../src/core/errors.js";
import { createAgentGraph } from "../../src/graph/create-agent-graph.js";
import { AGENT_GRAPH_STATE_VERSION } from "../../src/graph/state.js";
import { ModelProviderRegistry } from "../../src/models/registry.js";
import { StaticModelProvider } from "../../src/models/static-model-provider.js";
import type { Tracer } from "../../src/observability/tracer.js";
import { LangGraphRuntime } from "../../src/runtime/langgraph-runtime.js";
import { createMockSearchTool } from "../../src/tools/builtins/mock-search.js";
import { ToolRegistry } from "../../src/tools/registry.js";

const modelConfig = { provider: "openrouter", model: "fake-tool-model", temperature: 0 } as const;
const finalOutput = {
  answer: "Explicit state makes execution inspectable.",
  sources: [{ title: "Agent state", url: "https://example.test/agent-state" }],
  researchPerformed: true,
};

function createTools() {
  return new ToolRegistry([
    createMockSearchTool([
      {
        title: "Agent state",
        url: "https://example.test/agent-state",
        content: "Explicit state makes execution inspectable.",
      },
    ]),
  ]);
}

function createRuntime(
  model: FakeToolCallingModel,
  modelRetryMaxAttempts = 3,
  tracer?: Tracer,
  timeouts?: { modelTimeoutMs: number; runTimeoutMs: number },
) {
  return new LangGraphRuntime({
    providers: new ModelProviderRegistry([new StaticModelProvider("openrouter", model)]),
    tools: createTools(),
    modelRetryMaxAttempts,
    createRunId: () => "graph-run",
    now: () => new Date("2026-09-11T15:00:00.000Z"),
    tracer,
    ...timeouts,
  });
}

function createAgent(model: FakeToolCallingModel, maxSteps = 6) {
  const definition = createResearcherDefinition(modelConfig);
  return createStructuredAgent({
    definition: { ...definition, maxSteps },
    outputSchema: researcherOutputSchema,
    runtime: createRuntime(model),
  });
}

class FailOnceModel extends FakeToolCallingModel {
  attempts = 0;

  override bindTools(_tools: StructuredTool[]) {
    const bound = RunnableLambda.from<BaseLanguageModelInput, BaseMessage>(
      async (input: BaseLanguageModelInput, config?: RunnableConfig) => {
        this.attempts += 1;
        if (this.attempts === 1) {
          throw new Error("Transient provider failure.");
        }
        return this.invoke(input, config);
      },
    );
    return new RunnableBinding({ bound, config: {} });
  }
}

class HangingModel extends FakeToolCallingModel {
  override bindTools(_tools: StructuredTool[]) {
    const bound = RunnableLambda.from<BaseLanguageModelInput, BaseMessage>(
      () => new Promise<BaseMessage>(() => undefined),
    );
    return new RunnableBinding({ bound, config: {} });
  }
}

describe("LangGraphRuntime", () => {
  it("runs the visible model-tool-model-finalize loop", async () => {
    const model = new FakeToolCallingModel({
      toolCalls: [
        [{ name: "mock_search", args: { query: "agent state" }, id: "search-1" }],
        [{ name: "researcher_output", args: finalOutput, id: "output-1" }],
      ],
    });

    await expect(
      createAgent(model).run({ input: "Why use explicit state?" }),
    ).resolves.toMatchObject({
      runtime: "langgraph-explicit",
      output: finalOutput,
      stepCount: 2,
      toolCalls: [{ name: "mock_search", callId: "search-1", arguments: { query: "agent state" } }],
    });
  });

  it("traces the explicit agent, generation, and tool boundaries", async () => {
    const observedTypes: string[] = [];
    const tracer: Tracer = {
      async observe(spec, operation) {
        observedTypes.push(spec.type);
        return operation({ update: () => undefined });
      },
    };
    const model = new FakeToolCallingModel({
      toolCalls: [
        [{ name: "mock_search", args: { query: "agent state" }, id: "search-1" }],
        [{ name: "researcher_output", args: finalOutput, id: "output-1" }],
      ],
    });
    const definition = createResearcherDefinition(modelConfig);
    const agent = createStructuredAgent({
      definition,
      outputSchema: researcherOutputSchema,
      runtime: createRuntime(model, 3, tracer),
    });

    await agent.run({ input: "Trace this run." });

    expect(observedTypes).toEqual(["agent", "generation", "tool", "generation"]);
  });

  it("retries transient model-node failures", async () => {
    const model = new FailOnceModel({
      toolCalls: [[{ name: "researcher_output", args: finalOutput, id: "output-1" }]],
    });

    await expect(createAgent(model).run({ input: "Answer directly." })).resolves.toMatchObject({
      stepCount: 1,
    });
    expect(model.attempts).toBe(2);
  });

  it("wraps a model failure after the retry budget is exhausted", async () => {
    const model = new FailOnceModel({
      toolCalls: [[{ name: "researcher_output", args: finalOutput, id: "output-1" }]],
    });
    const agent = createStructuredAgent({
      definition: createResearcherDefinition(modelConfig),
      outputSchema: researcherOutputSchema,
      runtime: createRuntime(model, 1),
    });

    await expect(agent.run({ input: "Fail once without retrying." })).rejects.toBeInstanceOf(
      AgentExecutionError,
    );
    expect(model.attempts).toBe(1);
  });

  it("enforces the per-model-call timeout", async () => {
    const model = new HangingModel({ toolCalls: [] });
    const runtime = createRuntime(model, 1, undefined, {
      modelTimeoutMs: 5,
      runTimeoutMs: 100,
    });
    const agent = createStructuredAgent({
      definition: createResearcherDefinition(modelConfig),
      outputSchema: researcherOutputSchema,
      runtime,
    });

    await expect(agent.run({ input: "Never return." })).rejects.toBeInstanceOf(
      AgentModelTimeoutError,
    );
  });

  it("stops before exceeding the model-step budget", async () => {
    const model = new FakeToolCallingModel({
      toolCalls: [
        [{ name: "mock_search", args: { query: "loop one" }, id: "search-1" }],
        [{ name: "mock_search", args: { query: "loop two" }, id: "search-2" }],
      ],
    });

    await expect(createAgent(model, 2).run({ input: "Keep searching." })).rejects.toThrow(
      "exhausted its 2 model-step budget",
    );
  });

  it("fails deterministically when the model returns plain text", async () => {
    const model = new FakeToolCallingModel({ toolCalls: [[]] });

    await expect(createAgent(model).run({ input: "Return plain text." })).rejects.toThrow(
      "neither a tool call nor structured output",
    );
  });

  it("fails when terminal structured output does not satisfy its schema", async () => {
    const model = new FakeToolCallingModel({
      toolCalls: [
        [
          {
            name: "researcher_output",
            args: { answer: "Missing required fields." },
            id: "output-1",
          },
        ],
      ],
    });

    await expect(createAgent(model).run({ input: "Return invalid output." })).rejects.toThrow(
      "invalid structured output",
    );
  });

  it("fails when the terminal call is mixed with an effectful tool call", async () => {
    const model = new FakeToolCallingModel({
      toolCalls: [
        [
          { name: "mock_search", args: { query: "mixed" }, id: "search-1" },
          { name: "researcher_output", args: finalOutput, id: "output-1" },
        ],
      ],
    });

    await expect(createAgent(model).run({ input: "Mix final and tool calls." })).rejects.toThrow(
      "must be the only tool call",
    );
  });

  it("records a recoverable tool error and lets the model finish", async () => {
    const model = new FakeToolCallingModel({
      toolCalls: [
        [{ name: "not_authorized", args: {}, id: "bad-call" }],
        [{ name: "researcher_output", args: finalOutput, id: "output-1" }],
      ],
    });
    const definition = createResearcherDefinition(modelConfig);
    const graph = createAgentGraph({
      definition,
      outputSchema: researcherOutputSchema,
      model,
      tools: createTools(),
      modelRetryMaxAttempts: 1,
    });

    const state = await graph.invoke({
      schemaVersion: AGENT_GRAPH_STATE_VERSION,
      agentName: definition.name,
      runId: "run-1",
      startedAt: "2026-09-11T15:00:00.000Z",
      parentRunId: undefined,
      delegationDepth: 0,
      delegationMaxDepth: definition.maxSubagentDepth,
      promptVersion: definition.promptVersion,
      messages: [{ role: "user", content: "Recover from a bad tool call." }],
      stepCount: 0,
      toolCalls: [],
      toolResults: [],
      errors: [],
      approvalDecisions: [],
      childRuns: [],
      status: "running",
    });

    expect(state.status).toBe("completed");
    expect(state.errors).toMatchObject([{ node: "execute-tools", retryable: true }]);
    expect(state.toolResults).toMatchObject([{ status: "error", callId: "bad-call" }]);
  });

  it("rejects invalid runtime and reserved-tool configuration", () => {
    const providers = new ModelProviderRegistry([
      new StaticModelProvider("openrouter", new FakeToolCallingModel()),
    ]);
    expect(
      () => new LangGraphRuntime({ providers, tools: createTools(), modelRetryMaxAttempts: 0 }),
    ).toThrow(GraphConfigurationError);

    const definition = createResearcherDefinition(modelConfig);
    expect(() =>
      createAgentGraph({
        definition: { ...definition, tools: ["researcher_output"] },
        outputSchema: researcherOutputSchema,
        model: new FakeToolCallingModel(),
        tools: new ToolRegistry(),
        modelRetryMaxAttempts: 1,
      }),
    ).toThrow(GraphConfigurationError);
  });
});
