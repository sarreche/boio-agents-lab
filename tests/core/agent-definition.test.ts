import { describe, expect, it } from "vitest";

import { defineAgent } from "../../src/core/agent-definition.js";

describe("defineAgent", () => {
  it("applies safe execution defaults and freezes the definition", () => {
    const agent = defineAgent({
      name: "summarizer",
      description: "Summarizes supplied text",
      systemPrompt: "Return a concise, grounded summary.",
      model: { provider: "openrouter", model: "test-model" },
    });

    expect(agent.maxSteps).toBe(10);
    expect(agent.promptVersion).toBe("1.0.0");
    expect(Object.isFrozen(agent)).toBe(true);
  });

  it("rejects names that are unsafe registry keys", () => {
    expect(() =>
      defineAgent({
        name: "Bad Agent",
        description: "Invalid agent",
        systemPrompt: "No-op",
        promptVersion: "1.0.0",
        model: { provider: "openai", model: "test-model", temperature: 0 },
        tools: [],
        subagents: [],
        maxSteps: 1,
        maxSubagentDepth: 0,
        metadata: {},
      }),
    ).toThrow();
  });

  it("rejects duplicate tool permissions", () => {
    expect(() =>
      defineAgent({
        name: "duplicate-tools",
        description: "Invalid allowlist",
        systemPrompt: "No-op",
        model: { provider: "openai", model: "test-model" },
        tools: ["mock_search", "mock_search"],
      }),
    ).toThrow();
  });

  it("requires guarded tools to belong to the tool allowlist", () => {
    expect(() =>
      defineAgent({
        name: "invalid-approval-policy",
        description: "Invalid guarded tool policy",
        systemPrompt: "No-op",
        model: { provider: "openai", model: "test-model" },
        tools: [],
        approvalRequiredTools: ["publish_draft"],
      }),
    ).toThrow("Approval-required tools must also appear in the agent tool allowlist");
  });
});
