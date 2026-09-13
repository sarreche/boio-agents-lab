export class MiniAgentsError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ModelProviderNotRegisteredError extends MiniAgentsError {
  constructor(providerName: string) {
    super(`Model provider "${providerName}" is not registered.`);
  }
}

export class ModelProviderAlreadyRegisteredError extends MiniAgentsError {
  constructor(providerName: string) {
    super(`Model provider "${providerName}" is already registered.`);
  }
}

export class AgentExecutionError extends MiniAgentsError {}

export class AgentProtocolError extends AgentExecutionError {}

export class AgentStepLimitError extends AgentExecutionError {
  constructor(maxSteps: number) {
    super(`Agent exhausted its ${String(maxSteps)} model-step budget before producing output.`);
  }
}

export class GraphConfigurationError extends MiniAgentsError {}

export class ObservabilityConfigurationError extends MiniAgentsError {}

export class EvaluationConfigurationError extends MiniAgentsError {}

export class EvaluatorExecutionError extends MiniAgentsError {}

export class RegressionThresholdError extends MiniAgentsError {
  readonly violations: readonly string[];

  constructor(violations: readonly string[]) {
    super(`Evaluation regression gate failed: ${violations.join("; ")}`);
    this.violations = violations;
  }
}

export class AgentResumeNotSupportedError extends MiniAgentsError {}

export class AgentApprovalNotSupportedError extends MiniAgentsError {
  constructor(runtime: string) {
    super(`Runtime "${runtime}" does not support approval-required tools.`);
  }
}

export class AgentDelegationNotSupportedError extends MiniAgentsError {
  constructor(runtime: string) {
    super(`Runtime "${runtime}" does not support subagent delegation.`);
  }
}

export class SubagentAlreadyRegisteredError extends MiniAgentsError {
  constructor(agentName: string) {
    super(`Subagent "${agentName}" is already registered.`);
  }
}

export class SubagentNotRegisteredError extends MiniAgentsError {
  constructor(agentName: string) {
    super(`Subagent "${agentName}" is not registered.`);
  }
}

export class SubagentNotAuthorizedError extends MiniAgentsError {
  constructor(parentAgentName: string, childAgentName: string) {
    super(`Agent "${parentAgentName}" is not authorized to delegate to "${childAgentName}".`);
  }
}

export class SubagentDepthLimitError extends MiniAgentsError {
  constructor(maxDepth: number) {
    super(`Subagent delegation would exceed the root depth limit of ${String(maxDepth)}.`);
  }
}

export class SessionIdRequiredError extends MiniAgentsError {
  constructor(operation: "run" | "resume") {
    super(`A sessionId is required to ${operation} a checkpointed agent.`);
  }
}

export class AgentSessionNotFoundError extends MiniAgentsError {
  constructor(sessionId: string) {
    super(`No checkpoint exists for session "${sessionId}".`);
  }
}

export class AgentSessionAlreadyExistsError extends MiniAgentsError {
  constructor(sessionId: string) {
    super(`Session "${sessionId}" already has a checkpoint. Resume it or choose a new sessionId.`);
  }
}

export class AgentSessionNotInterruptedError extends MiniAgentsError {
  constructor(sessionId: string) {
    super(`Session "${sessionId}" is not waiting for a resume value.`);
  }
}

export class AgentSessionMismatchError extends MiniAgentsError {
  constructor(sessionId: string, expectedAgent: string, actualAgent: string) {
    super(`Session "${sessionId}" belongs to agent "${actualAgent}", not "${expectedAgent}".`);
  }
}

export class StructuredOutputValidationError extends AgentExecutionError {
  readonly issues: readonly string[];

  constructor(agentName: string, issues: readonly string[], options?: ErrorOptions) {
    super(`Agent "${agentName}" returned invalid structured output.`, options);
    this.issues = issues;
  }
}

export class ToolNotRegisteredError extends MiniAgentsError {
  constructor(toolName: string) {
    super(`Tool "${toolName}" is not registered.`);
  }
}

export class ToolAlreadyRegisteredError extends MiniAgentsError {
  constructor(toolName: string) {
    super(`Tool "${toolName}" is already registered.`);
  }
}

export class InvalidToolDefinitionError extends MiniAgentsError {
  constructor(message: string) {
    super(`Invalid tool definition: ${message}`);
  }
}

export class ToolNotAuthorizedError extends MiniAgentsError {
  constructor(toolName: string) {
    super(`Tool "${toolName}" is not authorized for this agent.`);
  }
}

export class InvalidToolArgumentsError extends MiniAgentsError {
  readonly issues: readonly string[];

  constructor(toolName: string, issues: readonly string[], options?: ErrorOptions) {
    super(`Tool "${toolName}" received invalid arguments.`, options);
    this.issues = issues;
  }
}

export class InvalidToolOutputError extends MiniAgentsError {
  readonly issues: readonly string[];

  constructor(toolName: string, issues: readonly string[], options?: ErrorOptions) {
    super(`Tool "${toolName}" returned invalid output.`, options);
    this.issues = issues;
  }
}

export class ToolExecutionError extends MiniAgentsError {
  constructor(toolName: string, options?: ErrorOptions) {
    super(`Tool "${toolName}" execution failed.`, options);
  }
}

export class ToolTimeoutError extends ToolExecutionError {
  constructor(toolName: string, timeoutMs: number) {
    super(toolName, { cause: new Error(`Timed out after ${String(timeoutMs)} ms.`) });
  }
}

export class SandboxViolationError extends MiniAgentsError {}
