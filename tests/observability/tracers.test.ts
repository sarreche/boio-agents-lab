import { describe, expect, it, vi } from "vitest";

import { ConsoleTracer, type ConsoleTraceEvent } from "../../src/observability/console-tracer.js";
import {
  LangfuseTracer,
  type StartActiveObservation,
} from "../../src/observability/langfuse-tracer.js";
import { NoopTracer } from "../../src/observability/noop-tracer.js";

describe("observability adapters", () => {
  it("keeps NoopTracer transparent on success and failure", async () => {
    const tracer = new NoopTracer();
    const success = vi.fn(() => Promise.resolve("ok"));
    const failure = new Error("operation failed");

    await expect(tracer.observe({ name: "test", type: "span" }, success)).resolves.toBe("ok");
    await expect(
      tracer.observe({ name: "test", type: "span" }, () => Promise.reject(failure)),
    ).rejects.toBe(failure);
    expect(success).toHaveBeenCalledOnce();
  });

  it("does not capture console payloads by default", async () => {
    const events: ConsoleTraceEvent[] = [];
    const tracer = new ConsoleTracer({
      now: () => new Date("2026-09-12T12:00:00.000Z"),
      write: (event) => {
        events.push(event);
      },
    });

    await tracer.observe(
      { name: "tool.echo", type: "tool", input: { password: "secret" } },
      (observation) => {
        observation.update({ output: { token: "secret" } });
        return Promise.resolve("ok");
      },
    );

    expect(events).toHaveLength(2);
    expect(events[0]).not.toHaveProperty("input");
    expect(events[1]).not.toHaveProperty("output");
  });

  it("redacts sensitive fields when console payload capture is enabled", async () => {
    const events: ConsoleTraceEvent[] = [];
    const tracer = new ConsoleTracer({
      captureInput: true,
      captureOutput: true,
      write: (event) => {
        events.push(event);
      },
    });

    await tracer.observe(
      {
        name: "tool.echo",
        type: "tool",
        input: { authorization: "Bearer value", safe: "visible" },
      },
      (observation) => {
        observation.update({ output: { nested: { apiKey: "value" } } });
        return Promise.resolve("ok");
      },
    );

    expect(events[0]?.input).toEqual({ authorization: "[REDACTED]", safe: "visible" });
    expect(events[1]?.output).toEqual({ nested: { apiKey: "[REDACTED]" } });
  });

  it("does not let a failing console writer change the operation", async () => {
    const operation = vi.fn(() => Promise.resolve("result"));
    const tracer = new ConsoleTracer({
      write: () => {
        throw new Error("writer unavailable");
      },
    });

    await expect(tracer.observe({ name: "agent.test", type: "agent" }, operation)).resolves.toBe(
      "result",
    );
    expect(operation).toHaveBeenCalledOnce();
  });

  it("maps observations to Langfuse and never repeats a completed operation", async () => {
    const updates: Record<string, unknown>[] = [];
    const operation = vi.fn(() => Promise.resolve("result"));
    const start: StartActiveObservation = async (_name, callback, options) => {
      expect(options).toEqual({ asType: "generation" });
      await callback({
        update: (attributes) => {
          updates.push(attributes);
        },
      });
      throw new Error("export failed after callback");
    };
    const tracer = new LangfuseTracer({ startActiveObservation: start });

    await expect(
      tracer.observe(
        { name: "generation.test", type: "generation", model: "fake-model", input: "private" },
        operation,
      ),
    ).resolves.toBe("result");
    expect(operation).toHaveBeenCalledOnce();
    expect(updates[0]).toMatchObject({ model: "fake-model" });
    expect(updates[0]?.input).toBeUndefined();
  });

  it("executes once without tracing when Langfuse fails before callback entry", async () => {
    const operation = vi.fn(() => Promise.resolve("result"));
    const start: StartActiveObservation = () => Promise.reject(new Error("context unavailable"));
    const tracer = new LangfuseTracer({ startActiveObservation: start });

    await expect(tracer.observe({ name: "agent.test", type: "agent" }, operation)).resolves.toBe(
      "result",
    );
    expect(operation).toHaveBeenCalledOnce();
  });
});
