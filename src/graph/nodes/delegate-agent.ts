import { AIMessage, ToolMessage } from "@langchain/core/messages";

import { AgentProtocolError, InvalidToolArgumentsError } from "../../core/errors.js";
import { NoopTracer } from "../../observability/noop-tracer.js";
import type { Tracer } from "../../observability/tracer.js";
import type { SubagentCoordinator } from "../../subagents/coordinator.js";
import {
  DELEGATE_AGENT_TOOL_NAME,
  delegationArgumentsSchema,
} from "../../subagents/coordinator.js";
import {
  childRunRecordSchema,
  serializeAgentError,
  type AgentGraphStateUpdate,
  type AgentGraphStateValue,
} from "../state.js";

function serializeContent(value: unknown): string {
  const serialized: unknown = JSON.stringify(value);
  return typeof serialized === "string" ? serialized : "null";
}

/** Executes one child synchronously and returns only its structured hand-off to the parent. */
export function createDelegateAgentNode(options: {
  coordinator: SubagentCoordinator;
  parentDefinition: Parameters<SubagentCoordinator["delegate"]>[0]["parentDefinition"];
  tracer?: Tracer;
}) {
  const tracer = options.tracer ?? new NoopTracer();
  return async (state: AgentGraphStateValue): Promise<AgentGraphStateUpdate> => {
    const lastMessage = state.messages.at(-1);
    if (!lastMessage || !AIMessage.isInstance(lastMessage)) {
      throw new AgentProtocolError("delegate-agent requires an AIMessage.");
    }
    if (lastMessage.tool_calls?.length !== 1) {
      throw new AgentProtocolError("delegate-agent requires exactly one model tool call.");
    }

    const toolCall = lastMessage.tool_calls[0];
    if (toolCall?.name !== DELEGATE_AGENT_TOOL_NAME) {
      throw new AgentProtocolError("delegate-agent received an invalid dispatch call.");
    }
    const callId = toolCall.id ?? `${String(state.stepCount)}-0`;
    const toolCallRecord = {
      name: toolCall.name,
      callId,
      arguments: toolCall.args,
    };

    try {
      const validation = await delegationArgumentsSchema.safeParseAsync(toolCall.args);
      if (!validation.success) {
        throw new InvalidToolArgumentsError(
          DELEGATE_AGENT_TOOL_NAME,
          validation.error.issues.map((issue) => issue.message),
          { cause: validation.error },
        );
      }

      const childRun = await tracer.observe(
        {
          name: `delegation.${validation.data.agentName}`,
          type: "span",
          input: validation.data.task,
          metadata: {
            parentRunId: state.runId,
            sessionId: state.sessionId,
            childAgentName: validation.data.agentName,
          },
        },
        async (observation) => {
          const result = childRunRecordSchema.parse(
            await options.coordinator.delegate({
              parentDefinition: options.parentDefinition,
              parentRunId: state.runId,
              parentDepth: state.delegationDepth,
              inheritedMaxDepth: state.delegationMaxDepth,
              ...validation.data,
            }),
          );
          observation.update({ output: result, metadata: { childRunId: result.childRunId } });
          return result;
        },
      );
      const content = serializeContent(childRun);
      return {
        messages: [
          new ToolMessage({ name: DELEGATE_AGENT_TOOL_NAME, tool_call_id: callId, content }),
        ],
        toolCalls: [toolCallRecord],
        toolResults: [{ name: DELEGATE_AGENT_TOOL_NAME, callId, status: "success", content }],
        childRuns: [childRun],
      };
    } catch (error) {
      const serializedError = serializeAgentError({
        node: "delegate-agent",
        error,
        retryable: true,
        step: state.stepCount,
      });
      const content = serializeContent({ error: serializedError });
      return {
        messages: [
          new ToolMessage({ name: DELEGATE_AGENT_TOOL_NAME, tool_call_id: callId, content }),
        ],
        toolCalls: [toolCallRecord],
        toolResults: [{ name: DELEGATE_AGENT_TOOL_NAME, callId, status: "error", content }],
        errors: [serializedError],
      };
    }
  };
}
