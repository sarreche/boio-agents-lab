import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";

import { routeAfterModel, routeAfterTools } from "../../src/graph/routers.js";
import {
  AGENT_GRAPH_STATE_VERSION,
  serializeAgentError,
  type AgentGraphStateValue,
} from "../../src/graph/state.js";

function stateWith(
  messages: AgentGraphStateValue["messages"],
  stepCount = 1,
): AgentGraphStateValue {
  return {
    schemaVersion: AGENT_GRAPH_STATE_VERSION,
    agentName: "test-agent",
    runId: "run-1",
    sessionId: undefined,
    promptVersion: "1.0.0",
    messages,
    stepCount,
    toolCalls: [],
    toolResults: [],
    errors: [],
    status: "running",
    failureReason: undefined,
    finalOutput: undefined,
  };
}

describe("explicit graph routers", () => {
  it("routes regular tool calls to execution", () => {
    const state = stateWith([
      new AIMessage({
        content: "",
        tool_calls: [{ name: "mock_search", args: { query: "state" }, id: "call-1" }],
      }),
    ]);

    expect(routeAfterModel(state, "test_agent_output")).toBe("execute-tools");
  });

  it("routes the terminal structured-output tool to finalize", () => {
    const state = stateWith([
      new AIMessage({
        content: "",
        tool_calls: [{ name: "test_agent_output", args: { answer: "done" }, id: "output-1" }],
      }),
    ]);

    expect(routeAfterModel(state, "test_agent_output")).toBe("finalize");
  });

  it("routes missing model tool calls to a protocol failure", () => {
    expect(routeAfterModel(stateWith([]), "output")).toBe("record-protocol-error");
    expect(routeAfterModel(stateWith([new HumanMessage("not an AI response")]), "output")).toBe(
      "record-protocol-error",
    );
    expect(routeAfterModel(stateWith([new AIMessage("plain text")]), "output")).toBe(
      "record-protocol-error",
    );
  });

  it("prevents another model call when the step budget is exhausted", () => {
    expect(routeAfterTools(stateWith([], 2), 2)).toBe("record-step-limit");
    expect(routeAfterTools(stateWith([], 1), 2)).toBe("call-model");
  });

  it("serializes thrown and non-Error failures without persisting Error objects", () => {
    expect(
      serializeAgentError({
        node: "node-a",
        error: new TypeError("bad type"),
        retryable: false,
        step: 2,
      }),
    ).toEqual({
      node: "node-a",
      code: "TypeError",
      message: "bad type",
      retryable: false,
      step: 2,
    });
    expect(
      serializeAgentError({ node: "node-b", error: "plain failure", retryable: true, step: 1 }),
    ).toMatchObject({ code: "Error", message: "plain failure" });
  });
});
