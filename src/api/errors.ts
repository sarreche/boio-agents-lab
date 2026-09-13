import { MiniAgentsError } from "../core/errors.js";

export class ApiAgentAlreadyRegisteredError extends MiniAgentsError {
  constructor(agentName: string) {
    super(`HTTP agent "${agentName}" is already registered.`);
  }
}

export class ApiAgentNotFoundError extends MiniAgentsError {
  constructor(agentName: string) {
    super(`HTTP agent "${agentName}" is not registered.`);
  }
}

export class ApiRunNotFoundError extends MiniAgentsError {
  constructor(runId: string) {
    super(`Run "${runId}" was not found.`);
  }
}

export class ApiSessionNotFoundError extends MiniAgentsError {
  constructor(sessionId: string) {
    super(`Session "${sessionId}" was not found.`);
  }
}

export class ApiRequestValidationError extends MiniAgentsError {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super("HTTP request validation failed.");
    this.issues = issues;
  }
}
