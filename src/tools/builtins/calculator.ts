import { z } from "zod";

import { ToolExecutionError } from "../../core/errors.js";
import { defineTool } from "../tool.js";

export function createCalculatorTool() {
  return defineTool({
    name: "calculator",
    description: "Perform arithmetic without evaluating arbitrary code.",
    inputSchema: z.object({
      operation: z.enum(["add", "subtract", "multiply", "divide"]),
      operands: z.array(z.number()).min(1).max(100),
    }),
    outputSchema: z.object({ result: z.number() }),
    execute: ({ operation, operands }) => {
      const [first, ...rest] = operands;
      if (first === undefined) {
        throw new ToolExecutionError("calculator", { cause: new Error("Missing operands.") });
      }

      if ((operation === "subtract" || operation === "divide") && rest.length === 0) {
        throw new ToolExecutionError("calculator", {
          cause: new Error(`${operation} requires at least two operands.`),
        });
      }

      const result = rest.reduce((accumulator, operand) => {
        switch (operation) {
          case "add":
            return accumulator + operand;
          case "subtract":
            return accumulator - operand;
          case "multiply":
            return accumulator * operand;
          case "divide":
            if (operand === 0) {
              throw new ToolExecutionError("calculator", {
                cause: new Error("Division by zero."),
              });
            }
            return accumulator / operand;
        }
      }, first);

      return { result };
    },
  });
}
