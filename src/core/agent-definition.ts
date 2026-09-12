import { z } from "zod";

/** Providers supported by the initial model registry design. */
export const modelProviderNameSchema = z.enum(["openrouter", "openai", "gemini", "groq", "ollama"]);

export type ModelProviderName = z.infer<typeof modelProviderNameSchema>;

export const modelConfigSchema = z.object({
  provider: modelProviderNameSchema,
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).default(0),
});

export type ModelConfig = z.infer<typeof modelConfigSchema>;

const uniqueNameListSchema = z
  .array(z.string().min(1))
  .refine((names) => new Set(names).size === names.length, "Names must be unique.");

/**
 * Serializable configuration shared by both runtimes.
 *
 * Runtime instances, model clients, and tool functions intentionally do not
 * belong here: persisted definitions should remain data, not live objects.
 */
export const agentDefinitionSchema = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9-]*$/),
    description: z.string().min(1),
    systemPrompt: z.string().min(1),
    promptVersion: z.string().min(1).default("1.0.0"),
    model: modelConfigSchema,
    tools: uniqueNameListSchema.default([]),
    approvalRequiredTools: uniqueNameListSchema.default([]),
    subagents: uniqueNameListSchema.default([]),
    maxSteps: z.number().int().positive().default(10),
    maxSubagentDepth: z.number().int().nonnegative().default(3),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .refine(
    (definition) =>
      definition.approvalRequiredTools.every((toolName) => definition.tools.includes(toolName)),
    {
      message: "Approval-required tools must also appear in the agent tool allowlist.",
      path: ["approvalRequiredTools"],
    },
  );

export type AgentDefinitionInput = z.input<typeof agentDefinitionSchema>;
export type AgentDefinition = z.output<typeof agentDefinitionSchema>;

export function defineAgent(definition: AgentDefinitionInput): Readonly<AgentDefinition> {
  return Object.freeze(agentDefinitionSchema.parse(definition));
}
