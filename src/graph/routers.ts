import { AIMessage } from "@langchain/core/messages";

import type { AgentGraphStateValue } from "./state.js";

export type AfterModelRoute =
  "execute-tools" | "request-approval" | "delegate-agent" | "finalize" | "record-protocol-error";
export type AfterToolsRoute = "call-model" | "record-step-limit";
export type AfterApprovalRoute = "execute-tools" | "reject-tools";

/** Pure routing decision based only on the latest persisted message. */
export function routeAfterModel(
  state: AgentGraphStateValue,
  structuredOutputToolName: string,
  approvalRequiredTools: readonly string[] = [],
  delegationToolName?: string,
): AfterModelRoute {
  const lastMessage = state.messages.at(-1);
  if (!lastMessage || !AIMessage.isInstance(lastMessage)) {
    return "record-protocol-error";
  }

  const toolCalls = lastMessage.tool_calls ?? [];
  if (toolCalls.some((toolCall) => toolCall.name === structuredOutputToolName)) {
    return "finalize";
  }
  if (
    delegationToolName !== undefined &&
    toolCalls.some(({ name }) => name === delegationToolName)
  ) {
    return toolCalls.length === 1 ? "delegate-agent" : "record-protocol-error";
  }
  if (toolCalls.some((toolCall) => approvalRequiredTools.includes(toolCall.name))) {
    return "request-approval";
  }
  return toolCalls.length > 0 ? "execute-tools" : "record-protocol-error";
}

/** Prevents another model call after the configured budget is exhausted. */
export function routeAfterTools(state: AgentGraphStateValue, maxSteps: number): AfterToolsRoute {
  return state.stepCount >= maxSteps ? "record-step-limit" : "call-model";
}

export function routeAfterApproval(state: AgentGraphStateValue): AfterApprovalRoute {
  return state.approvalDecisions.at(-1)?.decision === "approve" ? "execute-tools" : "reject-tools";
}
