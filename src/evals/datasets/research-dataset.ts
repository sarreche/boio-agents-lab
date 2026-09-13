import type { ResearcherOutput } from "../../agents/researcher.js";
import { defineEvaluationDataset } from "../dataset.js";

/** Small offline baseline covering both tool-use and direct-answer behavior. */
export const researchDataset = defineEvaluationDataset<Partial<ResearcherOutput>>({
  name: "researcher-baseline",
  version: "1.0.0",
  cases: [
    {
      id: "research-required",
      input: "Research why explicit agent state helps debugging.",
      expected: { researchPerformed: true },
      expectedBehavior: "Use search and cite the returned source.",
      expectedTools: ["mock_search"],
      forbiddenTools: [],
      tags: ["research", "tool-use"],
    },
    {
      id: "context-sufficient",
      input:
        "Using only this statement, answer whether the sky description is blue: The sky is blue.",
      expected: { researchPerformed: false },
      expectedBehavior: "Answer directly without search because the prompt contains the fact.",
      expectedTools: [],
      forbiddenTools: ["mock_search"],
      tags: ["research", "direct-answer"],
    },
  ],
});
