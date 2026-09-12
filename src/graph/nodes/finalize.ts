import { AIMessage } from "@langchain/core/messages";

import type { StructuredOutputSchema } from "../../core/agent-runtime.js";
import { AgentProtocolError, StructuredOutputValidationError } from "../../core/errors.js";
import {
  serializeAgentError,
  type AgentGraphStateUpdate,
  type AgentGraphStateValue,
} from "../state.js";

function failureUpdate(state: AgentGraphStateValue, error: Error): AgentGraphStateUpdate {
  return {
    status: "failed",
    failureReason: error.message,
    errors: [
      serializeAgentError({
        node: "finalize",
        error,
        retryable: false,
        step: state.stepCount,
      }),
    ],
  };
}

export function createFinalizeNode<TOutput extends Record<string, unknown>>(options: {
  outputSchema: StructuredOutputSchema<TOutput>;
  structuredOutputToolName: string;
}) {
  return async (state: AgentGraphStateValue): Promise<AgentGraphStateUpdate> => {
    const lastMessage = state.messages.at(-1);
    if (!lastMessage || !AIMessage.isInstance(lastMessage)) {
      return failureUpdate(state, new AgentProtocolError("finalize requires a final AIMessage."));
    }

    const toolCalls = lastMessage.tool_calls ?? [];
    const terminalCalls = toolCalls.filter(
      (toolCall) => toolCall.name === options.structuredOutputToolName,
    );
    if (toolCalls.length !== 1 || terminalCalls.length !== 1) {
      return failureUpdate(
        state,
        new AgentProtocolError(
          "Structured output must be the only tool call in the final message.",
        ),
      );
    }

    const validation = await options.outputSchema.safeParseAsync(terminalCalls[0]?.args);
    if (!validation.success) {
      return failureUpdate(
        state,
        new StructuredOutputValidationError(
          state.agentName,
          validation.error.issues.map((issue) => issue.message),
          { cause: validation.error },
        ),
      );
    }

    return { status: "completed", finalOutput: validation.data };
  };
}
