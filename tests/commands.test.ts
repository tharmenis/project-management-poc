import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { HttpResponse, http } from "msw";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleMessage } from "@/lib/bot";
import { unrelatedText } from "@/lib/bot/messages";
import { getConfig } from "@/lib/config";
import { todayInZone } from "@/lib/dates";
import { getDb } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { linkUser } from "@/lib/users";
import { server } from "./msw/server";

const DB_PATH = join(tmpdir(), `poc-bot-test-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = DB_PATH;

const BASE = "http://localhost:8080";

let userId: string;

const ctx = () => ({ userId, channel: "repl", clientMessageId: randomUUID() }) as const;

const workPackage = (id: number, subject: string, project: string, startDate: string) => ({
  id,
  subject,
  startDate,
  dueDate: startDate,
  _links: {
    project: { href: `/api/v3/projects/${project === "Acme" ? 3 : 1}`, title: project },
    status: { href: "/api/v3/statuses/1", title: "In progress" },
  },
});

beforeAll(async () => {
  migrate(getDb(), { migrationsFolder: "./drizzle" });
  server.use(
    http.get(`${BASE}/api/v3/users/me`, () =>
      HttpResponse.json({ id: 7, name: "Pilot User", login: "pilot" }),
    ),
  );
  const linked = await linkUser({ token: "pilot-token" });
  userId = linked.id;
});

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
});

describe("help command", () => {
  it("describes what the bot understands and records a command audit entry", async () => {
    const replies = await handleMessage(ctx(), "help");

    expect(replies).toHaveLength(1);
    expect(replies[0].text).toContain("my day");
    expect(replies[0].text).toContain('"undo"');

    const commands = getDb()
      .select()
      .from(auditLog)
      .all()
      .filter((row) => row.event === "command");
    expect(commands).toHaveLength(1);
  });
});

describe("my day command", () => {
  it("lists today's work packages sorted by project then start date", async () => {
    server.use(
      http.get(`${BASE}/api/v3/work_packages`, ({ request }) => {
        const filters = JSON.parse(
          new URL(request.url).searchParams.get("filters") ?? "[]",
        ) as Array<Record<string, unknown>>;
        const today = todayInZone(getConfig().APP_TIMEZONE);
        expect(JSON.stringify(filters)).toContain(today);

        return HttpResponse.json({
          _embedded: {
            elements: [
              workPackage(2, "Organize open source conference", "Demo project", "2026-09-21"),
              workPackage(82, "Rack mount server & cabling", "Acme", "2026-09-28"),
            ],
          },
        });
      }),
    );

    const replies = await handleMessage(ctx(), "my day");

    expect(replies[0].text).toContain("Your day,");
    const lines = replies[0].text.split("\n");
    expect(lines[1]).toContain("#82 Rack mount server & cabling");
    expect(lines[2]).toContain("#2 Organize open source conference");
    expect(lines[1]).toContain("Acme");

    const shown = getDb()
      .select()
      .from(auditLog)
      .all()
      .filter((row) => row.event === "my_day_shown");
    expect(shown).toHaveLength(1);
    expect(JSON.stringify(shown[0].payloadJson)).toContain('"count":2');
  });

  it("asks an unlinked user to link first", async () => {
    const replies = await handleMessage(
      { userId: "not-linked", channel: "repl", clientMessageId: randomUUID() },
      "my day",
    );

    expect(replies[0].text).toContain("Link your API token");
  });

  it("maps a 401 to a link-renewal message", async () => {
    server.use(
      http.get(`${BASE}/api/v3/work_packages`, () => new HttpResponse(null, { status: 401 })),
    );

    const replies = await handleMessage(ctx(), "my day");

    expect(replies[0].text).toBe("Your OpenProject link needs renewing.");
    expect(
      getDb()
        .select()
        .from(auditLog)
        .all()
        .some((row) => row.event === "error"),
    ).toBe(true);
  });
});

describe("free text", () => {
  it("goes to the proposal flow rather than the command router", async () => {
    server.use(
      http.get(`${BASE}/api/v3/work_packages`, () =>
        HttpResponse.json({ _embedded: { elements: [] } }),
      ),
      http.post(`${BASE}/api/v3/time_entries/form`, () =>
        HttpResponse.json({ _embedded: { schema: {} } }),
      ),
      http.get(`${BASE}/api/v3/statuses`, () =>
        HttpResponse.json({ _embedded: { elements: [] } }),
      ),
      http.post("http://llm.test/chat/completions", () =>
        HttpResponse.json({
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: JSON.stringify({
                  kind: "unrelated",
                  workPackageId: null,
                  timeEntry: null,
                  note: null,
                  statusName: null,
                  clarification: null,
                }),
              },
              finish_reason: "stop",
            },
          ],
        }),
      ),
    );

    const replies = await handleMessage(ctx(), "I spent 2 hours on the file server");

    expect(replies).toEqual([{ text: unrelatedText }]);
  });
});
