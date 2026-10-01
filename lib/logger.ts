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

const redaction: { paths: string[]; censor: string } = {
  paths: REDACT_PATHS,
  censor: "[redacted]",
};

let logger: Logger | undefined;

export function getLogger(): Logger {
  if (!logger) {
    logger = pino({ level: getConfig().LOG_LEVEL, redact: redaction });
  }
  return logger;
}

export function createFileLogger(dest: string): Logger {
  return pino(
    { level: getConfig().LOG_LEVEL, redact: redaction },
    pino.destination({ dest, mkdir: true }),
  );
}
