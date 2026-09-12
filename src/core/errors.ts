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
