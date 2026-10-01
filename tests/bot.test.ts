import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scrubSecrets } from "@/lib/audit";
import { handleMessage } from "@/lib/bot";
import { linkRequiredText } from "@/lib/bot/messages";
import { getDb } from "@/lib/db/client";
import { auditLog, processedMessages } from "@/lib/db/schema";

const DB_PATH = join(tmpdir(), `poc-bot-test-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = DB_PATH;

const USER = "user-1";
const context = (clientMessageId: string) =>
  ({ userId: USER, channel: "repl", clientMessageId }) as const;

beforeAll(() => {
  migrate(getDb(), { migrationsFolder: "./drizzle" });
});

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
});

describe("handleMessage", () => {
  it("replies and records the inbound message in the audit log", async () => {
    const replies = await handleMessage(context("msg-1"), "hello there");

    expect(replies).toEqual([{ text: linkRequiredText }]);

    const entries = getDb().select().from(auditLog).all();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      event: "message_received",
      userId: USER,
      channel: "repl",
      messageText: "hello there",
    });
  });

  it("processes a repeated clientMessageId only once", async () => {
    const first = await handleMessage(context("msg-duplicate"), "log 2h");
    const second = await handleMessage(context("msg-duplicate"), "log 2h");

    expect(first).toHaveLength(1);
    expect(second).toEqual([]);

    const processed = getDb()
      .select()
      .from(processedMessages)
      .all()
      .filter((row) => row.clientMessageId === "msg-duplicate");
    expect(processed).toHaveLength(1);

    const received = getDb()
      .select()
      .from(auditLog)
      .all()
      .filter((row) => row.event === "message_received" && row.messageText === "log 2h");
    expect(received).toHaveLength(2);
    expect(received.some((row) => JSON.stringify(row.payloadJson).includes("deduplicated"))).toBe(
      true,
    );
  });

  it("treats different clientMessageIds as separate messages", async () => {
    await handleMessage(context("msg-a"), "one");
    await handleMessage(context("msg-b"), "two");

    const rows = getDb()
      .select()
      .from(processedMessages)
      .all()
      .filter((row) => ["msg-a", "msg-b"].includes(row.clientMessageId));
    expect(rows).toHaveLength(2);
  });
});

describe("scrubSecrets", () => {
  it("redacts secret-looking keys at any depth", () => {
    const scrubbed = scrubSecrets({
      keep: "visible",
      token: "opapi-secret",
      nested: { apiKey: "abc", authorization: "Basic xyz", list: [{ password: "p" }] },
    });

    expect(scrubbed).toEqual({
      keep: "visible",
      token: "[redacted]",
      nested: { apiKey: "[redacted]", authorization: "[redacted]", list: [{ password: "[redacted]" }] },
    });
  });
});
