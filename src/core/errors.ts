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

export class StructuredOutputValidationError extends AgentExecutionError {
  readonly issues: readonly string[];

  constructor(agentName: string, issues: readonly string[], options?: ErrorOptions) {
    super(`Agent "${agentName}" returned invalid structured output.`, options);
    this.issues = issues;
  }
}
