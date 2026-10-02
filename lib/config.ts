import { z } from "zod";

const isBase64Key = (value: string): boolean => {
  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
};

export const envSchema = z.object({
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  APP_TIMEZONE: z.string().min(1).default("Europe/Athens"),
  DATABASE_PATH: z.string().min(1).default("./data/bot.db"),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine(isBase64Key, "must be a base64-encoded 32-byte key (openssl rand -base64 32)"),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  OPENPROJECT_BASE_URL: z.string().url(),
  OPENPROJECT_PROJECT_IDS: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((id) => Number(id.trim()))
            .filter((id) => Number.isInteger(id) && id > 0)
        : [],
    ),
  LLM_PROVIDER: z.enum(["deepseek", "anthropic", "openai"]).default("deepseek"),
  LLM_MODEL: z.string().min(1).default("deepseek-v4-flash"),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  PROPOSAL_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  UNDO_WINDOW_MINUTES: z.coerce.number().int().positive().default(30),
  CONTEXT_MEMORY_MINUTES: z.coerce.number().int().positive().default(30),
  CANDIDATE_DAYS_BACK: z.coerce.number().int().nonnegative().default(7),
  CANDIDATE_DAYS_AHEAD: z.coerce.number().int().nonnegative().default(1),
  MAX_DAYS_BACK_FOR_TIME: z.coerce.number().int().nonnegative().default(7),
  BOT_COMMENT_SUFFIX: z.string().default("(via chat bot)"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
});

export type Config = z.infer<typeof envSchema>;

export function parseEnv(raw: Record<string, string | undefined>): Config {
  return envSchema.parse(raw);
}

let cached: Config | undefined;

export function getConfig(): Config {
  if (!cached) {
    cached = parseEnv(process.env);
  }
  return cached;
}
