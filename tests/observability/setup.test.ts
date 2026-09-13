import { describe, expect, it } from "vitest";

import { parseEnvironment } from "../../src/config/environment.js";
import { ObservabilityConfigurationError } from "../../src/core/errors.js";
import { NoopTracer } from "../../src/observability/noop-tracer.js";
import { LangfuseTracer } from "../../src/observability/langfuse-tracer.js";
import { createObservability } from "../../src/observability/setup.js";

describe("createObservability", () => {
  it("returns a lifecycle-safe no-op when Langfuse is disabled", async () => {
    const observability = createObservability(parseEnvironment({}));

    expect(observability.tracer).toBeInstanceOf(NoopTracer);
    observability.start();
    await expect(observability.flush()).resolves.toBeUndefined();
    await expect(observability.shutdown()).resolves.toBeUndefined();
  });

  it("requires both Langfuse credentials when export is enabled", () => {
    const environment = parseEnvironment({ LANGFUSE_ENABLED: "true" });

    expect(() => createObservability(environment)).toThrow(ObservabilityConfigurationError);
  });

  it("builds the Langfuse adapter without starting global telemetry", () => {
    const environment = parseEnvironment({
      LANGFUSE_ENABLED: "true",
      LANGFUSE_PUBLIC_KEY: "public-test-key",
      LANGFUSE_SECRET_KEY: "secret-test-key",
    });

    const observability = createObservability(environment);

    expect(observability.tracer).toBeInstanceOf(LangfuseTracer);
  });
});
