import { startActiveObservation } from "@langfuse/tracing";

import {
  compactMetadata,
  redactSensitiveFields,
  safeErrorMessage,
  type ActiveObservation,
  type ObservationSpec,
  type TraceCapturePolicy,
  type Tracer,
} from "./tracer.js";

interface LangfuseObservationBoundary {
  update(attributes: Record<string, unknown>): void;
}

export type StartActiveObservation = <T>(
  name: string,
  operation: (observation: LangfuseObservationBoundary) => Promise<T>,
  options: { asType: ObservationSpec["type"] },
) => Promise<T>;

const defaultStartActiveObservation = startActiveObservation as unknown as StartActiveObservation;

export interface LangfuseTracerOptions extends TraceCapturePolicy {
  startActiveObservation?: StartActiveObservation;
}

/** Maps the project tracing port to Langfuse v5 observations. */
export class LangfuseTracer implements Tracer {
  readonly #captureInput: boolean;
  readonly #captureOutput: boolean;
  readonly #redact: (value: unknown) => unknown;
  readonly #start: StartActiveObservation;

  constructor(options: LangfuseTracerOptions = {}) {
    this.#captureInput = options.captureInput ?? false;
    this.#captureOutput = options.captureOutput ?? false;
    this.#redact = options.redact ?? redactSensitiveFields;
    this.#start = options.startActiveObservation ?? defaultStartActiveObservation;
  }

  async observe<T>(
    spec: ObservationSpec,
    operation: (observation: ActiveObservation) => Promise<T>,
  ): Promise<T> {
    const settlement: {
      status: "pending" | "fulfilled" | "rejected";
      value?: T;
      reason?: unknown;
    } = { status: "pending" };
    try {
      return await this.#start(
        spec.name,
        async (langfuseObservation) => {
          langfuseObservation.update({
            input: this.#captureInput ? this.#redact(spec.input) : undefined,
            metadata: compactMetadata(spec.metadata),
            model: spec.model,
            modelParameters: spec.modelParameters,
          });
          const observation: ActiveObservation = {
            update: (update) => {
              try {
                langfuseObservation.update({
                  ...update,
                  output: this.#captureOutput ? this.#redact(update.output) : undefined,
                  metadata: compactMetadata(update.metadata),
                });
              } catch {
                // Exporter failures cannot alter or repeat a side-effectful operation.
              }
            },
          };
          try {
            const value = await operation(observation);
            settlement.status = "fulfilled";
            settlement.value = value;
            return value;
          } catch (reason) {
            settlement.status = "rejected";
            settlement.reason = reason;
            try {
              langfuseObservation.update({
                level: "ERROR",
                statusMessage: safeErrorMessage(reason),
              });
            } catch {
              // Preserve the operation's original error.
            }
            throw reason;
          }
        },
        { asType: spec.type },
      );
    } catch {
      if (settlement.status === "fulfilled") return settlement.value as T;
      if (settlement.status === "rejected") throw settlement.reason;
      // An exporter/context failure must never suppress or duplicate the actual operation.
      return operation({
        update(_update): void {
          return undefined;
        },
      });
    }
  }
}
