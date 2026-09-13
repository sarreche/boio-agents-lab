import type { ClientTool } from "@langchain/core/tools";

import {
  ToolAlreadyRegisteredError,
  ToolNotAuthorizedError,
  ToolNotRegisteredError,
  ToolTimeoutError,
} from "../core/errors.js";
import { NoopTracer } from "../observability/noop-tracer.js";
import type { Tracer } from "../observability/tracer.js";
import type { RegisteredTool, ToolExecutionContext } from "./tool.js";

export interface ToolRegistryOptions {
  defaultTimeoutMs?: number;
}

export interface ExecuteToolRequest {
  name: string;
  input: unknown;
  authorizedTools: readonly string[];
  timeoutMs?: number;
  context?: Omit<ToolExecutionContext, "signal">;
  tracer?: Tracer;
}

export class ToolRegistry {
  readonly #tools = new Map<string, RegisteredTool>();
  readonly #defaultTimeoutMs: number;

  constructor(tools: readonly RegisteredTool[] = [], options: ToolRegistryOptions = {}) {
    this.#defaultTimeoutMs = options.defaultTimeoutMs ?? 30_000;
    for (const tool of tools) {
      this.register(tool);
    }
  }

  register(tool: RegisteredTool): void {
    if (this.#tools.has(tool.name)) {
      throw new ToolAlreadyRegisteredError(tool.name);
    }
    this.#tools.set(tool.name, tool);
  }

  get(name: string): RegisteredTool {
    const registeredTool = this.#tools.get(name);
    if (registeredTool === undefined) {
      throw new ToolNotRegisteredError(name);
    }
    return registeredTool;
  }

  async execute(request: ExecuteToolRequest): Promise<unknown> {
    if (!request.authorizedTools.includes(request.name)) {
      throw new ToolNotAuthorizedError(request.name);
    }

    const registeredTool = this.get(request.name);
    const timeoutMs = request.timeoutMs ?? this.#defaultTimeoutMs;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const tracer = request.tracer ?? new NoopTracer();
    try {
      return await tracer.observe(
        {
          name: `tool.${request.name}`,
          type: "tool",
          input: request.input,
          metadata: {
            runId: request.context?.runId,
            sessionId: request.context?.sessionId,
            timeoutMs,
          },
        },
        async (observation) => {
          const output = await Promise.race([
            registeredTool.invoke(request.input, {
              ...request.context,
              signal: controller.signal,
            }),
            new Promise<never>((_resolve, reject) => {
              timeout = setTimeout(() => {
                reject(new ToolTimeoutError(request.name, timeoutMs));
                controller.abort();
              }, timeoutMs);
            }),
          ]);
          observation.update({ output });
          return output;
        },
      );
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  }

  toLangChainTools(
    authorizedTools: readonly string[],
    context: Omit<ToolExecutionContext, "signal"> = {},
    tracer?: Tracer,
  ): ClientTool[] {
    return authorizedTools.map((name) => {
      const registeredTool = this.get(name);
      return registeredTool.createLangChainAdapter((input) =>
        this.execute({ name, input, authorizedTools, context, tracer }),
      );
    });
  }
}
