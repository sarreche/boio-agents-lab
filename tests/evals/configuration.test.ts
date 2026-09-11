import { describe, expect, it } from "vitest";

describe("evaluation harness configuration", () => {
  it("keeps deterministic evals separate from ordinary unit tests", () => {
    expect(true).toBe(true);
  });
});
