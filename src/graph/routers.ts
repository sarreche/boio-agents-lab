import { AIMessage } from "@langchain/core/messages";

import type { AgentGraphStateValue } from "./state.js";

export type AfterModelRoute = "execute-tools" | "finalize" | "record-protocol-error";
export type AfterToolsRoute = "call-model" | "record-step-limit";

/** Pure routing decision based only on the latest persisted message. */
export function routeAfterModel(
  state: AgentGraphStateValue,
  structuredOutputToolName: string,
): AfterModelRoute {
  const lastMessage = state.messages.at(-1);
  if (!lastMessage || !AIMessage.isInstance(lastMessage)) {
    return "record-protocol-error";
  }

  const toolCalls = lastMessage.tool_calls ?? [];
  if (toolCalls.some((toolCall) => toolCall.name === structuredOutputToolName)) {
    return "finalize";
  }
  return toolCalls.length > 0 ? "execute-tools" : "record-protocol-error";
}

/** Prevents another model call after the configured budget is exhausted. */
export function routeAfterTools(state: AgentGraphStateValue, maxSteps: number): AfterToolsRoute {
  return state.stepCount >= maxSteps ? "record-step-limit" : "call-model";
}
