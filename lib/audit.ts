import { getDb } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";

export type AuditEvent =
  | "user_linked"
  | "message_received"
  | "command"
  | "proposal_created"
  | "clarification_asked"
  | "confirmed"
  | "cancelled"
  | "expired"
  | "executed"
  | "undone"
  | "my_day_shown"
  | "error";

export interface AuditEntry {
  event: AuditEvent;
  userId?: string | null;
  channel?: string | null;
  messageText?: string | null;
  payload?: unknown;
  apiResponse?: unknown;
  error?: string | null;
  ts?: string;
}

const SECRET_KEYS = new Set([
  "token",
  "apitoken",
  "api_key",
  "apikey",
  "authorization",
  "cookie",
  "password",
  "secret",
  "token_ciphertext",
  "tokenciphertext",
]);

export function scrubSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubSecrets);

  if (value && typeof value === "object") {
    const scrubbed: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      scrubbed[key] = SECRET_KEYS.has(key.toLowerCase()) ? "[redacted]" : scrubSecrets(entry);
    }
    return scrubbed;
  }

  return value;
}

export function recordAudit(entry: AuditEntry): void {
  getDb()
    .insert(auditLog)
    .values({
      ts: entry.ts ?? new Date().toISOString(),
      userId: entry.userId ?? null,
      channel: entry.channel ?? null,
      event: entry.event,
      messageText: entry.messageText ?? null,
      payloadJson: scrubSecrets(entry.payload ?? null),
      apiResponseJson: scrubSecrets(entry.apiResponse ?? null),
      error: entry.error ?? null,
    })
    .run();
}
