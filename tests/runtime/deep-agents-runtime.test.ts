import { FakeToolCallingModel } from "langchain";
import { describe, expect, it, vi } from "vitest";

import {
  createResearcher,
  createResearcherDefinition,
  researcherOutputSchema,
} from "../../src/agents/researcher.js";
import {
  AgentApprovalNotSupportedError,
  AgentDelegationNotSupportedError,
} from "../../src/core/errors.js";
import { ModelProviderRegistry } from "../../src/models/registry.js";
import { StaticModelProvider } from "../../src/models/static-model-provider.js";
import {
  DeepAgentsRuntime,
  type HarnessProfileRegistrar,
} from "../../src/runtime/deep-agents-runtime.js";
import { createMockSearchTool } from "../../src/tools/builtins/mock-search.js";
import { ToolRegistry } from "../../src/tools/registry.js";

const modelConfig = {
  provider: "openrouter",
  model: "fake-deep-agent",
  temperature: 0,
} as const;

function dependencies(
  model: FakeToolCallingModel,
  registerHarnessProfile?: HarnessProfileRegistrar,
) {
  return {
    providers: new ModelProviderRegistry([new StaticModelProvider("openrouter", model)]),
    tools: new ToolRegistry([
      createMockSearchTool([
        {
          title: "Agent harnesses",
          url: "https://example.test/harnesses",
          content: "Explicit graphs expose control; harnesses provide batteries-included behavior.",
        },
      ]),
    ]),
    createRunId: () => "deep-run-1",
    now: () => new Date("2026-09-13T12:00:00.000Z"),
    registerHarnessProfile,
  };
}

describe("DeepAgentsRuntime", () => {
  it("executes the Researcher through the real Deep Agents harness", async () => {
    const output = {
      answer: "The explicit runtime exposes control while the harness supplies defaults.",
      sources: [{ title: "Agent harnesses", url: "https://example.test/harnesses" }],
      researchPerformed: true,
    };
    const model = new FakeToolCallingModel({
      toolCalls: [
        [{ name: "mock_search", args: { query: "agent harnesses" }, id: "search-1" }],
        [{ name: "researcher_output", args: output, id: "output-1" }],
      ],
    });
    const registerProfile = vi.fn<HarnessProfileRegistrar>();
    const researcher = createResearcher({
      model: modelConfig,
      runtime: new DeepAgentsRuntime(dependencies(model, registerProfile)),
    });

    const result = await researcher.run({ input: "Compare explicit graphs and agent harnesses." });

    expect(result).toMatchObject({
      status: "completed",
      runtime: "deep-agents",
      runId: "deep-run-1",
      output,
      toolCalls: [{ name: "mock_search", callId: "search-1" }],
    });
    const registeredProfile = registerProfile.mock.calls[0];
    expect(registeredProfile?.[0]).toBe("openrouter");
    expect(registeredProfile?.[1].generalPurposeSubagent).toEqual({ enabled: false });
    expect(registeredProfile?.[1].excludedTools).toEqual(
      expect.arrayContaining(["execute", "task", "write_file"]),
    );
    const boundTools = (model as unknown as { tools: { name: string }[] }).tools;
    expect(boundTools.map((tool) => tool.name)).not.toEqual(
      expect.arrayContaining(["execute", "task", "write_file"]),
    );
  });

  it("rejects capabilities whose MiniAgents semantics are not adapted yet", async () => {
    const model = new FakeToolCallingModel();
    const runtime = new DeepAgentsRuntime(dependencies(model, vi.fn<HarnessProfileRegistrar>()));
    const definition = createResearcherDefinition(modelConfig);

    await expect(
      runtime.runStructured({
        definition: { ...definition, approvalRequiredTools: ["mock_search"] },
        outputSchema: researcherOutputSchema,
        request: { input: "Require approval." },
      }),
    ).rejects.toBeInstanceOf(AgentApprovalNotSupportedError);
    await expect(
      runtime.runStructured({
        definition: { ...definition, subagents: ["specialist"] },
        outputSchema: researcherOutputSchema,
        request: { input: "Delegate." },
      }),
    ).rejects.toBeInstanceOf(AgentDelegationNotSupportedError);
  });
});
