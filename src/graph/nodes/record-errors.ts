import { AgentProtocolError, AgentStepLimitError } from "../../core/errors.js";
import {
  serializeAgentError,
  type AgentGraphStateUpdate,
  type AgentGraphStateValue,
} from "../state.js";

function recordFailure(
  state: AgentGraphStateValue,
  node: string,
  error: Error,
): AgentGraphStateUpdate {
  return {
    status: "failed",
    failureReason: error.message,
    errors: [serializeAgentError({ node, error, retryable: false, step: state.stepCount })],
  };
}

export function recordProtocolErrorNode(state: AgentGraphStateValue): AgentGraphStateUpdate {
  return recordFailure(
    state,
    "record-protocol-error",
    new AgentProtocolError("The model returned neither a tool call nor structured output."),
  );
}

export function createRecordStepLimitNode(maxSteps: number) {
  return (state: AgentGraphStateValue): AgentGraphStateUpdate =>
    recordFailure(state, "record-step-limit", new AgentStepLimitError(maxSteps));
}
