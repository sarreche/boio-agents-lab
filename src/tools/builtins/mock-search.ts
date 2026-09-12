import { z } from "zod";

import { defineTool } from "../tool.js";

export interface MockSearchDocument {
  title: string;
  url: string;
  content: string;
}

const searchResultSchema = z.object({
  title: z.string(),
  url: z.url(),
  snippet: z.string(),
});

const mockSearchOutputSchema = z.object({
  query: z.string(),
  results: z.array(searchResultSchema),
});

function tokenize(value: string): string[] {
  return value
    .toLocaleLowerCase("en")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1);
}

export function createMockSearchTool(documents: readonly MockSearchDocument[]) {
  return defineTool({
    name: "mock_search",
    description: "Search a deterministic local corpus. Use it when the answer needs research.",
    inputSchema: z.object({
      query: z.string().min(1).describe("Search terms relevant to the research question."),
      limit: z.number().int().min(1).max(10).default(5),
    }),
    outputSchema: mockSearchOutputSchema,
    execute: ({ query, limit }) => {
      const terms = new Set(tokenize(query));
      const results = documents
        .map((document) => ({
          document,
          score: tokenize(`${document.title} ${document.content}`).filter((token) =>
            terms.has(token),
          ).length,
        }))
        .filter(({ score }) => score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, limit)
        .map(({ document }) => ({
          title: document.title,
          url: document.url,
          snippet: document.content.slice(0, 240),
        }));

      return { query, results };
    },
  });
}
