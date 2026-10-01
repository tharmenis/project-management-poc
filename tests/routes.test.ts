import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db/client";
import { auditLog, processedMessages, sessions, userLinks } from "@/lib/db/schema";
import { SESSION_COOKIE, createSession } from "@/lib/session";
import { server } from "./msw/server";

const { cookieStore } = vi.hoisted(() => ({ cookieStore: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieStore.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  }),
}));

const { POST: chatPost } = await import("@/app/api/chat/route");
const { GET: myDayGet } = await import("@/app/api/my-day/route");
const { POST: linkPost } = await import("@/app/api/link/route");

const DB_PATH = join(tmpdir(), `poc-bot-test-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = DB_PATH;

const APP = "http://localhost:3000";
const OP = "http://localhost:8080";

function jsonRequest(body: unknown, origin = APP): Request {
  return new Request(`${APP}/api/chat`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(() => {
  migrate(getDb(), { migrationsFolder: "./drizzle" });
});

beforeEach(() => {
  const now = new Date().toISOString();
  getDb()
    .insert(userLinks)
    .values({
      id: "user-1",
      displayName: "Pilot",
      opUserId: "99",
      opUserName: "pilot",
      tokenCiphertext: "x",
      tokenIv: "y",
      tokenTag: "z",
      rcUserId: null,
      active: true,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();
});

afterEach(() => {
  cookieStore.clear();
  // Delete in foreign-key order.
  getDb().delete(sessions).run();
  getDb().delete(processedMessages).run();
  getDb().delete(auditLog).run();
  getDb().delete(userLinks).run();
});

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
});

describe("POST /api/chat", () => {
  it("requires a session", async () => {
    const response = await chatPost(jsonRequest({ clientMessageId: "m1", text: "help" }));

    expect(response.status).toBe(401);
  });

  it("rejects a request from another origin", async () => {
    cookieStore.set(SESSION_COOKIE, createSession("user-1").value);

    const response = await chatPost(
      jsonRequest({ clientMessageId: "m1", text: "help" }, "http://evil.example"),
    );

    expect(response.status).toBe(403);
  });

  it("answers a command and processes a repeated message only once", async () => {
    cookieStore.set(SESSION_COOKIE, createSession("user-1").value);

    const first = await chatPost(jsonRequest({ clientMessageId: "dup-1", text: "help" }));
    const second = await chatPost(jsonRequest({ clientMessageId: "dup-1", text: "help" }));

    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { replies: { text: string }[] };
    expect(firstBody.replies[0].text).toContain("my day");

    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ replies: [] });
  });
});

describe("GET /api/my-day", () => {
  it("requires a session", async () => {
    const response = await myDayGet();

    expect(response.status).toBe(401);
  });
});

describe("POST /api/link", () => {
  const linkRequest = (token: string) => {
    const form = new FormData();
    form.set("token", token);
    return new Request(`${APP}/api/link`, {
      method: "POST",
      headers: { origin: APP },
      body: form,
    });
  };

  it("rejects an invalid token and stores nothing", async () => {
    server.use(http.get(`${OP}/api/v3/users/me`, () => new HttpResponse(null, { status: 401 })));

    const response = await linkPost(linkRequest("bad-token"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("/link?error=invalid");
    // Only the seeded user remains; the failed link stored nothing.
    const rows = getDb().select().from(userLinks).all();
    expect(rows.some((row) => row.opUserId === "7")).toBe(false);
    expect(cookieStore.has(SESSION_COOKIE)).toBe(false);
  });

  it("links a valid token and starts a session", async () => {
    server.use(
      http.get(`${OP}/api/v3/users/me`, () =>
        HttpResponse.json({ id: 7, name: "Pilot User", login: "pilot" }),
      ),
    );

    const response = await linkPost(linkRequest("good-token"));

    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/");
    expect(
      getDb()
        .select()
        .from(userLinks)
        .all()
        .some((row) => row.opUserId === "7"),
    ).toBe(true);
    expect(cookieStore.has(SESSION_COOKIE)).toBe(true);
  });
});
