import { describe, expect, it } from "vitest";

import { parseEnvironment } from "../../src/config/environment.js";

describe("parseEnvironment", () => {
  it("provides deterministic local defaults", () => {
    const environment = parseEnvironment({});

    expect(environment.PORT).toBe(3000);
    expect(environment.LANGFUSE_ENABLED).toBe(false);
    expect(environment.AGENT_MAX_SUBAGENT_DEPTH).toBe(3);
  });

  it("rejects invalid boolean values instead of guessing", () => {
    expect(() => parseEnvironment({ LANGFUSE_ENABLED: "yes" })).toThrow();
  });
});
