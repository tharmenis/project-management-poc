import pino, { type Logger } from "pino";
import { getConfig } from "@/lib/config";

const REDACT_PATHS = [
  "authorization",
  "cookie",
  "token",
  "apiKey",
  "*.authorization",
  "*.cookie",
  "*.token",
  "*.apiKey",
  "req.headers.authorization",
  "req.headers.cookie",
  "headers.authorization",
  "headers.cookie",
];

let logger: Logger | undefined;

export function getLogger(): Logger {
  if (!logger) {
    logger = pino({
      level: getConfig().LOG_LEVEL,
      redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    });
  }
  return logger;
}
