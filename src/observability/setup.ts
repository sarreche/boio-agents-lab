import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeSDK } from "@opentelemetry/sdk-node";

import type { Environment } from "../config/environment.js";
import { ObservabilityConfigurationError } from "../core/errors.js";
import { LangfuseTracer } from "./langfuse-tracer.js";
import { NoopTracer } from "./noop-tracer.js";
import { redactSensitiveFields, type Tracer } from "./tracer.js";

export interface Observability {
  tracer: Tracer;
  start(): void;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

class NoopObservability implements Observability {
  readonly tracer = new NoopTracer();
  start(): void {
    return undefined;
  }
  flush(): Promise<void> {
    return Promise.resolve();
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

class LangfuseObservability implements Observability {
  readonly tracer: Tracer;
  readonly #processor: LangfuseSpanProcessor;
  readonly #sdk: NodeSDK;
  #started = false;
  #stopped = false;

  constructor(environment: Environment) {
    if (
      environment.LANGFUSE_PUBLIC_KEY === undefined ||
      environment.LANGFUSE_SECRET_KEY === undefined
    ) {
      throw new ObservabilityConfigurationError(
        "LANGFUSE_ENABLED requires LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY.",
      );
    }
    this.#processor = new LangfuseSpanProcessor({
      publicKey: environment.LANGFUSE_PUBLIC_KEY,
      secretKey: environment.LANGFUSE_SECRET_KEY,
      baseUrl: environment.LANGFUSE_BASE_URL,
      environment: environment.NODE_ENV,
      mediaUploadEnabled: false,
      mask: ({ data }: { data: unknown }) => redactSensitiveFields(data),
    });
    this.#sdk = new NodeSDK({ spanProcessors: [this.#processor] });
    this.tracer = new LangfuseTracer({
      captureInput: environment.LANGFUSE_CAPTURE_INPUT,
      captureOutput: environment.LANGFUSE_CAPTURE_OUTPUT,
    });
  }

  start(): void {
    if (this.#started || this.#stopped) return;
    this.#sdk.start();
    this.#started = true;
  }

  async flush(): Promise<void> {
    if (!this.#started || this.#stopped) return;
    await this.#processor.forceFlush();
  }

  async shutdown(): Promise<void> {
    if (!this.#started || this.#stopped) return;
    this.#stopped = true;
    await this.#sdk.shutdown();
  }
}

/** Creates an explicit lifecycle; callers decide when global OTel registration starts. */
export function createObservability(environment: Environment): Observability {
  return environment.LANGFUSE_ENABLED
    ? new LangfuseObservability(environment)
    : new NoopObservability();
}
