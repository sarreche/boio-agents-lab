import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { z } from "zod";

import {
  AgentResumeNotSupportedError,
  AgentRunTimeoutError,
  AgentSessionAlreadyExistsError,
  AgentSessionMismatchError,
  AgentSessionNotFoundError,
  AgentSessionNotInterruptedError,
  MiniAgentsError,
  SessionIdRequiredError,
} from "../core/errors.js";
import type { HttpAgentRegistry } from "./agent-registry.js";
import {
  ApiAgentNotFoundError,
  ApiRequestValidationError,
  ApiRunNotFoundError,
  ApiSessionNotFoundError,
} from "./errors.js";
import { InMemoryApiRunStore } from "./run-store.js";
import type { ApiRunStore } from "./run-store.js";

const routeParamsSchema = z.object({
  agentName: z.string().trim().min(1),
});
const runLookupParamsSchema = z.object({ runId: z.string().trim().min(1) });
const sessionLookupParamsSchema = z.object({ sessionId: z.string().trim().min(1) });
const metadataSchema = z.record(z.string(), z.unknown());
const runBodySchema = z.object({
  input: z.string().min(1),
  sessionId: z.string().trim().min(1).optional(),
  metadata: metadataSchema.optional(),
});
const resumeBodySchema = z.object({
  sessionId: z.string().trim().min(1),
  value: z.unknown(),
  metadata: metadataSchema.optional(),
});

export interface CreateHttpApiOptions {
  agents: HttpAgentRegistry;
  runStore?: ApiRunStore;
  logger?: FastifyServerOptions["logger"];
  bodyLimit?: number;
}

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    issues?: readonly string[];
  };
}

function parseRequest<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiRequestValidationError(
      result.error.issues.map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`),
    );
  }
  return result.data;
}

function errorResponse(code: string, message: string, issues?: readonly string[]): ErrorResponse {
  return { error: { code, message, ...(issues === undefined ? {} : { issues }) } };
}

function isHttpError(error: unknown): error is Error & { statusCode: number } {
  return error instanceof Error && "statusCode" in error && typeof error.statusCode === "number";
}

export function createHttpApi(options: CreateHttpApiOptions): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: options.bodyLimit ?? 65_536,
  });
  const runStore = options.runStore ?? new InMemoryApiRunStore();

  app.post("/agents/:agentName/run", async (request, reply) => {
    const { agentName } = parseRequest(routeParamsSchema, request.params);
    const body = parseRequest(runBodySchema, request.body);
    const outcome = await options.agents.get(agentName).run(body);
    await runStore.save(outcome);
    return await reply.code(outcome.status === "interrupted" ? 202 : 200).send(outcome);
  });

  app.post("/agents/:agentName/resume", async (request, reply) => {
    const { agentName } = parseRequest(routeParamsSchema, request.params);
    const body = parseRequest(resumeBodySchema, request.body);
    const outcome = await options.agents.get(agentName).resume(body);
    await runStore.save(outcome);
    return await reply.code(outcome.status === "interrupted" ? 202 : 200).send(outcome);
  });

  app.get("/runs/:runId", async (request) => {
    const { runId } = parseRequest(runLookupParamsSchema, request.params);
    return await runStore.getRun(runId);
  });

  app.get("/sessions/:sessionId", async (request) => {
    const { sessionId } = parseRequest(sessionLookupParamsSchema, request.params);
    return await runStore.getSession(sessionId);
  });

  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof ApiRequestValidationError) {
      return await reply
        .code(400)
        .send(errorResponse("INVALID_REQUEST", error.message, error.issues));
    }
    if (
      error instanceof ApiAgentNotFoundError ||
      error instanceof ApiRunNotFoundError ||
      error instanceof ApiSessionNotFoundError ||
      error instanceof AgentSessionNotFoundError
    ) {
      return await reply.code(404).send(errorResponse("NOT_FOUND", error.message));
    }
    if (
      error instanceof AgentSessionAlreadyExistsError ||
      error instanceof AgentSessionMismatchError ||
      error instanceof AgentSessionNotInterruptedError
    ) {
      return await reply.code(409).send(errorResponse("SESSION_CONFLICT", error.message));
    }
    if (error instanceof SessionIdRequiredError || error instanceof AgentResumeNotSupportedError) {
      return await reply.code(422).send(errorResponse("UNPROCESSABLE_REQUEST", error.message));
    }
    if (error instanceof AgentRunTimeoutError) {
      return await reply.code(504).send(errorResponse("RUN_TIMEOUT", error.message));
    }

    if (isHttpError(error)) {
      if (error.statusCode === 413) {
        return await reply
          .code(413)
          .send(errorResponse("PAYLOAD_TOO_LARGE", "Request body exceeds the configured limit."));
      }
      if (error.statusCode >= 400 && error.statusCode < 500) {
        return await reply
          .code(error.statusCode)
          .send(errorResponse("INVALID_REQUEST", error.message));
      }
    }

    requestLogError(app, error);
    const message =
      error instanceof MiniAgentsError ? "Agent execution failed." : "Internal server error.";
    return await reply.code(500).send(errorResponse("INTERNAL_ERROR", message));
  });

  return app;
}

function requestLogError(app: FastifyInstance, error: unknown): void {
  app.log.error({ err: error }, "HTTP request failed");
}
