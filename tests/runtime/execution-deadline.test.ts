import { describe, expect, it } from "vitest";

import { ExecutionConfigurationError } from "../../src/core/errors.js";
import { executeWithDeadline } from "../../src/core/execution-deadline.js";

describe("executeWithDeadline", () => {
  it("returns a result and clears the deadline", async () => {
    await expect(
      executeWithDeadline({
        timeoutMs: 50,
        timeoutError: () => new Error("too slow"),
        operation: () => Promise.resolve("done"),
      }),
    ).resolves.toBe("done");
  });

  it("rejects at the deadline and requests cooperative cancellation", async () => {
    let observedSignal: AbortSignal | undefined;
    const result = executeWithDeadline({
      timeoutMs: 5,
      timeoutError: () => new Error("deadline reached"),
      operation: (signal) => {
        observedSignal = signal;
        return new Promise<string>(() => undefined);
      },
    });

    await expect(result).rejects.toThrow("deadline reached");
    expect(observedSignal?.aborted).toBe(true);
  });

  it("combines a parent cancellation signal with its own deadline", async () => {
    const parent = new AbortController();
    let observedSignal: AbortSignal | undefined;
    const result = executeWithDeadline({
      timeoutMs: 50,
      parentSignal: parent.signal,
      timeoutError: () => new Error("deadline reached"),
      operation: (signal) => {
        observedSignal = signal;
        return Promise.resolve("done");
      },
    });
    parent.abort();

    await expect(result).resolves.toBe("done");
    expect(observedSignal?.aborted).toBe(true);
  });

  it("rejects invalid timeout configuration", async () => {
    await expect(
      executeWithDeadline({
        timeoutMs: 0,
        timeoutError: () => new Error("unused"),
        operation: () => Promise.resolve("unused"),
      }),
    ).rejects.toBeInstanceOf(ExecutionConfigurationError);
  });
});
