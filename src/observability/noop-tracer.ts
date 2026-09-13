import type { ActiveObservation, ObservationSpec, ObservationUpdate, Tracer } from "./tracer.js";

const NOOP_OBSERVATION: ActiveObservation = {
  update(_update: ObservationUpdate): void {
    return undefined;
  },
};

/** Zero-overhead semantic fallback used when observability is disabled. */
export class NoopTracer implements Tracer {
  observe<T>(
    _spec: ObservationSpec,
    operation: (observation: ActiveObservation) => Promise<T>,
  ): Promise<T> {
    return operation(NOOP_OBSERVATION);
  }
}
