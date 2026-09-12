import { AIMessage } from "@langchain/core/messages";
import { interrupt } from "@langchain/langgraph";

import { AgentProtocolError } from "../../core/errors.js";
import {
  humanApprovalDecisionSchema,
  type AgentGraphStateUpdate,
  type AgentGraphStateValue,
  type ToolApprovalInterrupt,
} from "../state.js";

/**
 * Pauses before any effect. On resume LangGraph restarts this node, so all work
 * before interrupt is deterministic and safe to repeat.
 */
export function createRequestApprovalNode(now: () => Date) {
  return (state: AgentGraphStateValue): AgentGraphStateUpdate => {
    const lastMessage = state.messages.at(-1);
    if (!lastMessage || !AIMessage.isInstance(lastMessage) || !lastMessage.tool_calls?.length) {
      throw new AgentProtocolError("request-approval requires pending model tool calls.");
    }
    if (state.sessionId === undefined) {
      throw new AgentProtocolError("request-approval requires a checkpoint sessionId.");
    }

    const toolCalls = lastMessage.tool_calls.map((toolCall, index) => ({
      name: toolCall.name,
      callId: toolCall.id ?? `${String(state.stepCount)}-${String(index)}`,
      arguments: toolCall.args,
    }));
    let payload: ToolApprovalInterrupt = {
      kind: "tool-approval",
      agentName: state.agentName,
      runId: state.runId,
      sessionId: state.sessionId,
      toolCalls,
    };

    for (;;) {
      const candidate: unknown = interrupt(payload);
      const validation = humanApprovalDecisionSchema.safeParse(candidate);
      if (validation.success) {
        return {
          approvalDecisions: [
            {
              ...validation.data,
              decidedAt: now().toISOString(),
              toolCallIds: toolCalls.map((toolCall) => toolCall.callId),
            },
          ],
        };
      }
      payload = {
        ...payload,
        validationErrors: validation.error.issues.map((issue) => issue.message),
      };
    }
  };
}
