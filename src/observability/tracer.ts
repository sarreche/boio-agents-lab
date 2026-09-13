export type ObservationType = "agent" | "generation" | "tool" | "evaluator" | "span";
export type ObservationLevel = "DEBUG" | "DEFAULT" | "WARNING" | "ERROR";
export type TraceMetadataValue = string | number | boolean | null;
export type TraceMetadata = Readonly<Record<string, TraceMetadataValue | undefined>>;

export interface ObservationSpec {
  name: string;
  type: ObservationType;
  input?: unknown;
  metadata?: TraceMetadata;
  model?: string;
  modelParameters?: Readonly<Record<string, string | number>>;
}

export interface ObservationUpdate {
  output?: unknown;
  metadata?: TraceMetadata;
  level?: ObservationLevel;
  statusMessage?: string;
}

export interface ActiveObservation {
  update(update: ObservationUpdate): void;
}

/** Project-owned tracing port. Callback scope preserves parent-child context. */
export interface Tracer {
  observe<T>(
    spec: ObservationSpec,
    operation: (observation: ActiveObservation) => Promise<T>,
  ): Promise<T>;
}

export interface TraceCapturePolicy {
  captureInput?: boolean;
  captureOutput?: boolean;
  redact?: (value: unknown) => unknown;
}

const SENSITIVE_KEY = /api[-_]?key|authorization|credential|password|secret|token/i;

/** Recursively masks common credential fields without mutating the source payload. */
export function redactSensitiveFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveFields);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactSensitiveFields(nested),
      ]),
    );
  }
  return value;
}

export function compactMetadata(
  metadata: TraceMetadata | undefined,
): Record<string, TraceMetadataValue> | undefined {
  if (metadata === undefined) return undefined;
  const compact = Object.fromEntries(
    Object.entries(metadata).filter(
      (entry): entry is [string, TraceMetadataValue] => entry[1] !== undefined,
    ),
  );
  return Object.keys(compact).length === 0 ? undefined : compact;
}

export function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : "Unknown execution error";
}
