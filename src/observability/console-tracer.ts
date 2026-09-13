import {
  compactMetadata,
  redactSensitiveFields,
  safeErrorMessage,
  type ActiveObservation,
  type ObservationSpec,
  type ObservationUpdate,
  type TraceCapturePolicy,
  type Tracer,
} from "./tracer.js";

export interface ConsoleTraceEvent {
  event: "observation.start" | "observation.end" | "observation.error";
  name: string;
  type: ObservationSpec["type"];
  timestamp: string;
  durationMs?: number;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, string | number | boolean | null>;
  level?: ObservationUpdate["level"];
  statusMessage?: string;
}

export interface ConsoleTracerOptions extends TraceCapturePolicy {
  now?: () => Date;
  write?: (event: ConsoleTraceEvent) => void;
}

/** Emits structured local events; model and tool payload capture is opt-in. */
export class ConsoleTracer implements Tracer {
  readonly #captureInput: boolean;
  readonly #captureOutput: boolean;
  readonly #redact: (value: unknown) => unknown;
  readonly #now: () => Date;
  readonly #write: (event: ConsoleTraceEvent) => void;

  constructor(options: ConsoleTracerOptions = {}) {
    this.#captureInput = options.captureInput ?? false;
    this.#captureOutput = options.captureOutput ?? false;
    this.#redact = options.redact ?? redactSensitiveFields;
    this.#now = options.now ?? (() => new Date());
    this.#write =
      options.write ??
      ((event) => {
        console.info(JSON.stringify(event));
      });
  }

  async observe<T>(
    spec: ObservationSpec,
    operation: (observation: ActiveObservation) => Promise<T>,
  ): Promise<T> {
    const started = this.#now();
    const base = {
      name: spec.name,
      type: spec.type,
      metadata: compactMetadata(spec.metadata),
    };
    this.#emit({
      event: "observation.start",
      ...base,
      timestamp: started.toISOString(),
      ...(this.#captureInput ? { input: this.#redact(spec.input) } : {}),
    });

    let update: ObservationUpdate = {};
    const observation: ActiveObservation = {
      update: (next) => {
        update = { ...update, ...next, metadata: { ...update.metadata, ...next.metadata } };
      },
    };
    try {
      const result = await operation(observation);
      const ended = this.#now();
      this.#emit({
        event: "observation.end",
        ...base,
        timestamp: ended.toISOString(),
        durationMs: ended.getTime() - started.getTime(),
        ...(this.#captureOutput ? { output: this.#redact(update.output) } : {}),
        metadata: compactMetadata({ ...spec.metadata, ...update.metadata }),
        level: update.level,
        statusMessage: update.statusMessage,
      });
      return result;
    } catch (error) {
      const ended = this.#now();
      this.#emit({
        event: "observation.error",
        ...base,
        timestamp: ended.toISOString(),
        durationMs: ended.getTime() - started.getTime(),
        level: "ERROR",
        statusMessage: safeErrorMessage(error),
      });
      throw error;
    }
  }

  #emit(event: ConsoleTraceEvent): void {
    try {
      this.#write(event);
    } catch {
      // Observability is best-effort and must not change agent execution semantics.
    }
  }
}
