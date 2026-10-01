import { createHash, randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";

export const SESSION_COOKIE = "bot_session";

export function hashSessionValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sessionTtlSeconds(): number {
  return getConfig().SESSION_TTL_DAYS * 86_400;
}

export interface CreatedSession {
  value: string;
  expiresAt: string;
}

export function createSession(userId: string, now: Date = new Date()): CreatedSession {
  const value = randomBytes(32).toString("base64url");
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + sessionTtlSeconds() * 1000).toISOString();

  getDb()
    .insert(sessions)
    .values({
      idHash: hashSessionValue(value),
      userId,
      createdAt: nowIso,
      expiresAt,
      lastSeenAt: nowIso,
    })
    .run();

  return { value, expiresAt };
}

export function getSessionUserId(value: string, now: Date = new Date()): string | undefined {
  const idHash = hashSessionValue(value);
  const row = getDb().select().from(sessions).where(eq(sessions.idHash, idHash)).get();
  if (!row) return undefined;

  if (row.expiresAt <= now.toISOString()) {
    getDb().delete(sessions).where(eq(sessions.idHash, idHash)).run();
    return undefined;
  }

  getDb()
    .update(sessions)
    .set({ lastSeenAt: now.toISOString() })
    .where(eq(sessions.idHash, idHash))
    .run();

  return row.userId;
}

export function deleteSession(value: string): void {
  getDb().delete(sessions).where(eq(sessions.idHash, hashSessionValue(value))).run();
}

export function deleteExpiredSessions(now: Date = new Date()): number {
  return getDb().delete(sessions).where(lt(sessions.expiresAt, now.toISOString())).run().changes;
}

export interface SessionCookieOptions {
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
}

export function sessionCookieOptions(
  baseUrl: string = getConfig().APP_BASE_URL,
): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    // Secure everywhere except a plain-HTTP localhost development URL.
    secure: !isLocalhostHttp(baseUrl),
    path: "/",
    maxAge: sessionTtlSeconds(),
  };
}

function isLocalhostHttp(baseUrl: string): boolean {
  return /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(baseUrl);
}
