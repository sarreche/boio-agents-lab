import { z } from "zod";

import { ToolExecutionError } from "../../core/errors.js";
import { defineTool } from "../tool.js";

export interface CurrentTimeToolOptions {
  now?: () => Date;
}

export function createCurrentTimeTool(options: CurrentTimeToolOptions = {}) {
  const now = options.now ?? (() => new Date());

  return defineTool({
    name: "current_time",
    description: "Return the current time using an explicit IANA timezone.",
    inputSchema: z.object({
      timezone: z.string().min(1).default("UTC"),
    }),
    outputSchema: z.object({
      iso: z.string(),
      timezone: z.string(),
      formatted: z.string(),
    }),
    execute: ({ timezone }) => {
      const instant = now();
      try {
        return {
          iso: instant.toISOString(),
          timezone,
          formatted: new Intl.DateTimeFormat("en-CA", {
            dateStyle: "full",
            timeStyle: "long",
            timeZone: timezone,
          }).format(instant),
        };
      } catch (cause) {
        throw new ToolExecutionError("current_time", { cause });
      }
    },
  });
}
