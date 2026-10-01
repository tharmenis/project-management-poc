import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { sessions, userLinks } from "@/lib/db/schema";
import {
  createSession,
  deleteSession,
  getSessionUserId,
  hashSessionValue,
  sessionCookieOptions,
} from "@/lib/session";

const DB_PATH = join(tmpdir(), `poc-bot-test-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = DB_PATH;

const USER_ID = "user-1";

beforeAll(() => {
  migrate(getDb(), { migrationsFolder: "./drizzle" });
  getDb()
    .insert(userLinks)
    .values({
      id: USER_ID,
      displayName: "Pilot",
      opUserId: "7",
      opUserName: "pilot",
      tokenCiphertext: "x",
      tokenIv: "y",
      tokenTag: "z",
      rcUserId: null,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .run();
});

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
});

describe("sessions", () => {
  it("resolves a session value to its user", () => {
    const { value } = createSession(USER_ID);

    expect(getSessionUserId(value)).toBe(USER_ID);
  });

  it("stores only the hash of the cookie value", () => {
    const { value } = createSession(USER_ID);

    const row = getDb()
      .select()
      .from(sessions)
      .where(eq(sessions.idHash, hashSessionValue(value)))
      .get();

    expect(row).toBeDefined();
    expect(row?.idHash).not.toBe(value);
    expect(row?.idHash).toHaveLength(64);
  });

  it("rejects an unknown value", () => {
    expect(getSessionUserId("not-a-real-session")).toBeUndefined();
  });

  it("expires a session and removes it", () => {
    const { value } = createSession(USER_ID);
    const later = new Date(Date.now() + 40 * 86_400_000);

    expect(getSessionUserId(value, later)).toBeUndefined();
    expect(getDb().select().from(sessions).where(eq(sessions.idHash, hashSessionValue(value))).get()).toBeUndefined();
  });

  it("deletes a session on sign out", () => {
    const { value } = createSession(USER_ID);
    deleteSession(value);

    expect(getSessionUserId(value)).toBeUndefined();
  });
});

describe("session cookie options", () => {
  it("omits Secure for a plain-HTTP localhost URL", () => {
    const options = sessionCookieOptions("http://localhost:3000");

    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", secure: false, path: "/" });
  });

  it("sets Secure everywhere else", () => {
    expect(sessionCookieOptions("https://bot.example.com").secure).toBe(true);
    expect(sessionCookieOptions("http://10.0.0.5:3000").secure).toBe(true);
  });
});
