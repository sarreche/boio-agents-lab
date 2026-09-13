import { describe, expect, it } from "vitest";

import { parseEnvironment } from "../../src/config/environment.js";

describe("parseEnvironment", () => {
  it("provides deterministic local defaults", () => {
    const environment = parseEnvironment({});

    expect(environment.PORT).toBe(3000);
    expect(environment.LANGFUSE_ENABLED).toBe(false);
    expect(environment.LANGFUSE_CAPTURE_INPUT).toBe(false);
    expect(environment.LANGFUSE_CAPTURE_OUTPUT).toBe(false);
    expect(environment.AGENT_MAX_SUBAGENT_DEPTH).toBe(3);
    expect(environment.AGENT_RUN_TIMEOUT_MS).toBe(300_000);
  });

  it("rejects invalid boolean values instead of guessing", () => {
    expect(() => parseEnvironment({ LANGFUSE_ENABLED: "yes" })).toThrow();
  });
});
