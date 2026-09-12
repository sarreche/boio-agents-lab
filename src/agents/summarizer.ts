import { z } from "zod";

import { defineAgent, type ModelConfig } from "../core/agent-definition.js";
import { createStructuredAgent, type AgentRuntime } from "../core/agent-runtime.js";

export const summarizerOutputSchema = z.object({
  summary: z.string().min(1).describe("A concise summary grounded only in the supplied text."),
  keyPoints: z
    .array(z.string().min(1))
    .describe("The most important distinct points from the supplied text."),
});

export type SummarizerOutput = z.output<typeof summarizerOutputSchema>;

export function createSummarizerDefinition(model: ModelConfig) {
  return defineAgent({
    name: "summarizer",
    description: "Summarizes supplied text into a concise summary and key points.",
    systemPrompt: [
      "You summarize only the text supplied by the user.",
      "Do not add facts or assumptions that are absent from the source.",
      "Return a concise summary and a list of distinct key points.",
    ].join("\n"),
    promptVersion: "1.0.0",
    model,
    tools: [],
    maxSteps: 1,
  });
}

export function createSummarizer(options: { model: ModelConfig; runtime: AgentRuntime }) {
  return createStructuredAgent({
    definition: createSummarizerDefinition(options.model),
    outputSchema: summarizerOutputSchema,
    runtime: options.runtime,
  });
}
