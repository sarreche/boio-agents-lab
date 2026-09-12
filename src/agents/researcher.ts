import { z } from "zod";

import { defineAgent, type ModelConfig } from "../core/agent-definition.js";
import { createStructuredAgent, type AgentRuntime } from "../core/agent-runtime.js";

export const researcherOutputSchema = z
  .object({
    answer: z.string().min(1).describe("A concise answer grounded in the available evidence."),
    sources: z.array(
      z.object({
        title: z.string().min(1),
        url: z.url(),
      }),
    ),
    researchPerformed: z.boolean(),
  })
  .meta({ title: "researcher_output" });

export type ResearcherOutput = z.output<typeof researcherOutputSchema>;

export function createResearcherDefinition(model: ModelConfig) {
  return defineAgent({
    name: "researcher",
    description: "Researches questions with explicitly authorized search tools.",
    systemPrompt: [
      "You are a careful research agent.",
      "Use mock_search when the question needs information beyond the supplied prompt.",
      "Do not claim that research was performed unless you called mock_search.",
      "Ground the answer in search results and list only sources you actually received.",
      "If the prompt already contains everything needed, answer without calling a tool.",
    ].join("\n"),
    promptVersion: "1.0.0",
    model,
    tools: ["mock_search"],
    maxSteps: 6,
  });
}

export function createResearcher(options: { model: ModelConfig; runtime: AgentRuntime }) {
  return createStructuredAgent({
    definition: createResearcherDefinition(options.model),
    outputSchema: researcherOutputSchema,
    runtime: options.runtime,
  });
}
