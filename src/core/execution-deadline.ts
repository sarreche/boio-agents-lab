import { ExecutionConfigurationError } from "./errors.js";

export interface ExecutionDeadlineOptions<T> {
  timeoutMs: number;
  operation: (signal: AbortSignal) => Promise<T>;
  timeoutError: () => Error;
  parentSignal?: AbortSignal;
}

/** Enforces a wall-clock deadline and requests cooperative cancellation. */
export async function executeWithDeadline<T>(options: ExecutionDeadlineOptions<T>): Promise<T> {
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1) {
    throw new ExecutionConfigurationError("Execution timeout must be a positive integer.");
  }

  const timeoutController = new AbortController();
  const signal =
    options.parentSignal === undefined
      ? timeoutController.signal
      : AbortSignal.any([options.parentSignal, timeoutController.signal]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = options.timeoutError();
      reject(error);
      timeoutController.abort(error);
    }, options.timeoutMs);
  });

  try {
    return await Promise.race([options.operation(signal), deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
