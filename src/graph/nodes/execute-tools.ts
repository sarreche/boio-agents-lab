import { AIMessage, ToolMessage } from "@langchain/core/messages";

import { AgentProtocolError } from "../../core/errors.js";
import type { ToolRegistry } from "../../tools/registry.js";
import type { Tracer } from "../../observability/tracer.js";
import {
  serializeAgentError,
  type AgentGraphStateUpdate,
  type AgentGraphStateValue,
} from "../state.js";

function serializeToolContent(value: unknown): string {
  const serialized: unknown = JSON.stringify(value);
  return typeof serialized === "string" ? serialized : "null";
}

/** Executes model-requested tools sequentially so side-effect order remains visible. */
export function createExecuteToolsNode(options: {
  tools: ToolRegistry;
  authorizedTools: readonly string[];
  tracer?: Tracer;
}) {
  return async (state: AgentGraphStateValue): Promise<AgentGraphStateUpdate> => {
    const lastMessage = state.messages.at(-1);
    if (!lastMessage || !AIMessage.isInstance(lastMessage) || !lastMessage.tool_calls?.length) {
      throw new AgentProtocolError(
        "execute-tools requires an AIMessage with at least one tool call.",
      );
    }

    const messages: ToolMessage[] = [];
    const toolCalls: NonNullable<AgentGraphStateUpdate["toolCalls"]> = [];
    const toolResults: NonNullable<AgentGraphStateUpdate["toolResults"]> = [];
    const errors: NonNullable<AgentGraphStateUpdate["errors"]> = [];

    for (const [index, toolCall] of lastMessage.tool_calls.entries()) {
      const callId = toolCall.id ?? `${String(state.stepCount)}-${String(index)}`;
      toolCalls.push({ name: toolCall.name, callId, arguments: toolCall.args });

      try {
        const output = await options.tools.execute({
          name: toolCall.name,
          input: toolCall.args,
          authorizedTools: options.authorizedTools,
          context: { runId: state.runId, sessionId: state.sessionId },
          tracer: options.tracer,
        });
        const content = serializeToolContent(output);
        messages.push(new ToolMessage({ name: toolCall.name, tool_call_id: callId, content }));
        toolResults.push({ name: toolCall.name, callId, status: "success", content });
      } catch (error) {
        const serializedError = serializeAgentError({
          node: "execute-tools",
          error,
          retryable: true,
          step: state.stepCount,
        });
        const content = serializeToolContent({ error: serializedError });
        messages.push(new ToolMessage({ name: toolCall.name, tool_call_id: callId, content }));
        toolResults.push({ name: toolCall.name, callId, status: "error", content });
        errors.push(serializedError);
      }
    }

    return { messages, toolCalls, toolResults, errors };
  };
}
