import { AIMessage, ToolMessage } from "@langchain/core/messages";

import { AgentProtocolError } from "../../core/errors.js";
import type { AgentGraphStateUpdate, AgentGraphStateValue } from "../state.js";

/** Records rejection as protocol-valid ToolMessages without executing effects. */
export function rejectToolsNode(state: AgentGraphStateValue): AgentGraphStateUpdate {
  const lastMessage = state.messages.at(-1);
  const decision = state.approvalDecisions.at(-1);
  if (
    !lastMessage ||
    !AIMessage.isInstance(lastMessage) ||
    !lastMessage.tool_calls?.length ||
    decision?.decision !== "reject"
  ) {
    throw new AgentProtocolError("reject-tools requires rejected pending tool calls.");
  }

  const messages: ToolMessage[] = [];
  const toolCalls: NonNullable<AgentGraphStateUpdate["toolCalls"]> = [];
  const toolResults: NonNullable<AgentGraphStateUpdate["toolResults"]> = [];

  for (const [index, toolCall] of lastMessage.tool_calls.entries()) {
    const callId = toolCall.id ?? `${String(state.stepCount)}-${String(index)}`;
    const content = JSON.stringify({
      rejected: true,
      actor: decision.actor,
      reason: decision.reason,
    });
    messages.push(new ToolMessage({ name: toolCall.name, tool_call_id: callId, content }));
    toolCalls.push({ name: toolCall.name, callId, arguments: toolCall.args });
    toolResults.push({ name: toolCall.name, callId, status: "rejected", content });
  }

  return { messages, toolCalls, toolResults };
}
