import { z } from "zod";

const optionalSecret = z.string().trim().min(1).optional();

const booleanFromEnvironment = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

/** A single validated boundary between process.env and application code. */
export const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  AGENT_FILE_SANDBOX_ROOT: z.string().min(1).default(".data/sandbox"),
  MODEL_PROVIDER: z
    .enum(["openrouter", "openai", "gemini", "groq", "ollama"])
    .default("openrouter"),
  MODEL_NAME: z.string().default(""),
  MODEL_TEMPERATURE: z.coerce.number().min(0).max(2).default(0),
  OPENROUTER_API_KEY: optionalSecret,
  OPENROUTER_BASE_URL: z.url().default("https://openrouter.ai/api/v1"),
  OPENAI_API_KEY: optionalSecret,
  GOOGLE_API_KEY: optionalSecret,
  GROQ_API_KEY: optionalSecret,
  OLLAMA_BASE_URL: z.url().default("http://127.0.0.1:11434"),
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_SSL: booleanFromEnvironment,
  LANGFUSE_PUBLIC_KEY: optionalSecret,
  LANGFUSE_SECRET_KEY: optionalSecret,
  LANGFUSE_BASE_URL: z.url().default("https://cloud.langfuse.com"),
  LANGFUSE_ENABLED: booleanFromEnvironment,
  AGENT_MAX_STEPS: z.coerce.number().int().positive().default(10),
  AGENT_MAX_SUBAGENT_DEPTH: z.coerce.number().int().nonnegative().default(3),
  AGENT_MODEL_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  AGENT_TOOL_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  AGENT_MAX_RETRIES: z.coerce.number().int().nonnegative().default(2),
});

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(source: NodeJS.ProcessEnv): Environment {
  return environmentSchema.parse(source);
}
