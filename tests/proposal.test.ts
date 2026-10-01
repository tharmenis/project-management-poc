import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { handleMessage } from "@/lib/bot";
import { getConfig } from "@/lib/config";
import { todayInZone } from "@/lib/dates";
import { getDb } from "@/lib/db/client";
import { proposals as proposalsTable } from "@/lib/db/schema";
import { linkUser } from "@/lib/users";
import { server } from "./msw/server";

const DB_PATH = join(tmpdir(), `poc-bot-test-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = DB_PATH;

const BASE = "http://localhost:8080";
const LLM = "http://llm.test/chat/completions";

let userId: string;
let today: string;
let llmProposal: Record<string, unknown>;

const ctx = () => ({ userId, channel: "repl", clientMessageId: randomUUID() }) as const;

const WORK_PACKAGES = [
  {
    id: 82,
    subject: "Rack mount server & cabling",
    startDate: today0(),
    dueDate: today0(),
    lockVersion: 3,
    _links: {
      project: { href: "/api/v3/projects/3", title: "Acme – File server installation" },
      status: { href: "/api/v3/statuses/7", title: "New" },
      type: { href: "/api/v3/types/1", title: "Task" },
    },
  },
  {
    id: 84,
    subject: "Migrate shares & NTFS permissions",
    startDate: today0(),
    dueDate: today0(),
    lockVersion: 1,
    _links: {
      project: { href: "/api/v3/projects/3", title: "Acme – File server installation" },
      status: { href: "/api/v3/statuses/7", title: "New" },
      type: { href: "/api/v3/types/1", title: "Task" },
    },
  },
];

function today0(): string {
  return "2026-10-01";
}

const activitiesForm = {
  _embedded: {
    schema: {
      activity: {
        _links: {
          allowedValues: [
            { href: "/api/v3/time_entries/activities/3", title: "On-site" },
            { href: "/api/v3/time_entries/activities/4", title: "Remote" },
          ],
        },
      },
    },
  },
};

const statusForm = {
  _embedded: {
    schema: {
      status: {
        _links: {
          allowedValues: [
            { href: "/api/v3/statuses/1", title: "New" },
            { href: "/api/v3/statuses/7", title: "In progress" },
            { href: "/api/v3/statuses/12", title: "Closed" },
          ],
        },
      },
    },
  },
};

const updateProposal = (overrides: Record<string, unknown> = {}) => ({
  kind: "update",
  workPackageId: 82,
  timeEntry: { hours: 2, activityId: 3, spentOn: today },
  note: "Replaced the PSU; server back online.",
  statusName: "Closed",
  clarification: null,
  ...overrides,
});

function installDefaults() {
  server.use(
    http.get(`${BASE}/api/v3/users/me`, () =>
      HttpResponse.json({ id: 7, name: "Pilot User", login: "pilot" }),
    ),
    http.get(`${BASE}/api/v3/work_packages`, () =>
      HttpResponse.json({ _embedded: { elements: WORK_PACKAGES } }),
    ),
    http.get(`${BASE}/api/v3/work_packages/:id`, ({ params }) => {
      const workPackage = WORK_PACKAGES.find((entry) => entry.id === Number(params.id));
      return workPackage
        ? HttpResponse.json(workPackage)
        : new HttpResponse(null, { status: 404 });
    }),
    http.post(`${BASE}/api/v3/time_entries/form`, () => HttpResponse.json(activitiesForm)),
    http.get(`${BASE}/api/v3/statuses`, () =>
      HttpResponse.json({
        _embedded: {
          elements: [
            { id: 1, name: "New" },
            { id: 7, name: "In progress" },
            { id: 12, name: "Closed" },
          ],
        },
      }),
    ),
    http.post(`${BASE}/api/v3/work_packages/:id/form`, () => HttpResponse.json(statusForm)),
    http.post(LLM, () =>
      HttpResponse.json({
        id: "chatcmpl-1",
        object: "chat.completion",
        created: 1,
        model: "deepseek-v4-flash",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: JSON.stringify(llmProposal) },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }),
    ),
  );
}

beforeAll(async () => {
  migrate(getDb(), { migrationsFolder: "./drizzle" });
  today = todayInZone(getConfig().APP_TIMEZONE);
  llmProposal = updateProposal({ timeEntry: { hours: 2, activityId: 3, spentOn: today } });
  installDefaults();
  const linked = await linkUser({ token: "pilot-token" });
  userId = linked.id;
});

beforeEach(() => {
  installDefaults();
  llmProposal = updateProposal({ timeEntry: { hours: 2, activityId: 3, spentOn: today } });
});

afterEach(() => {
  getDb().delete(proposalsTable).run();
});

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
});

describe("proposal flow", () => {
  it("turns free text into a confirmation and stores a pending proposal", async () => {
    const replies = await handleMessage(ctx(), "2h on-site at the file server, replaced the PSU, done");

    expect(replies[0].text).toContain("Log this on #82 Rack mount server & cabling");
    expect(replies[0].text).toContain("• Time: 2 h, On-site, today");
    expect(replies[0].text).toContain("• Note: Replaced the PSU; server back online.");
    expect(replies[0].text).toContain("• Status: New → Closed");
    expect(replies[0].actions).toEqual([
      { label: "Confirm", value: "yes" },
      { label: "Cancel", value: "no" },
    ]);

    const rows = getDb().select().from(proposalsTable).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
  });

  it("asks for a choice when the message is ambiguous", async () => {
    llmProposal = {
      kind: "clarify",
      workPackageId: null,
      timeEntry: null,
      note: null,
      statusName: null,
      clarification: {
        question: "Which server task did you mean?",
        optionWorkPackageIds: [82, 84],
      },
    };

    const replies = await handleMessage(ctx(), "did some server work");

    expect(replies[0].text).toContain("Which server task did you mean?");
    expect(replies[0].text).toContain("1. #82 Rack mount server & cabling");
    expect(replies[0].text).toContain("2. #84 Migrate shares & NTFS permissions");
    expect(replies[0].actions).toEqual([
      { label: "#82 Rack mount server & cabling", value: "1" },
      { label: "#84 Migrate shares & NTFS permissions", value: "2" },
    ]);

    const rows = getDb().select().from(proposalsTable).all();
    expect(rows[0].status).toBe("clarifying");
  });

  it("continues with a confirmation when the user picks a number", async () => {
    llmProposal = {
      kind: "clarify",
      workPackageId: null,
      timeEntry: null,
      note: null,
      statusName: null,
      clarification: { question: "Which one?", optionWorkPackageIds: [82, 84] },
    };
    await handleMessage(ctx(), "did some server work");

    llmProposal = updateProposal({ workPackageId: 84, statusName: null });
    const replies = await handleMessage(ctx(), "2");

    expect(replies[0].text).toContain("Log this on #84 Migrate shares & NTFS permissions");
  });

  it("asks a specific follow-up when a status is not allowed", async () => {
    llmProposal = updateProposal({ statusName: "Done" });

    const replies = await handleMessage(ctx(), "mark it done");

    expect(replies[0].text).toContain('"Done" isn\'t a status you can set');
    expect(replies[0].text).toContain("Closed");
    expect(getDb().select().from(proposalsTable).all()).toHaveLength(0);
  });

  it("asks the user to pick an activity when none was inferred", async () => {
    llmProposal = updateProposal({
      timeEntry: { hours: 2, activityId: null, spentOn: today },
      note: null,
      statusName: null,
    });

    const replies = await handleMessage(ctx(), "2h on the server");

    expect(replies[0].text).toContain("Which activity should I use?");
    expect(replies[0].text).toContain("On-site");
    expect(getDb().select().from(proposalsTable).all()).toHaveLength(0);
  });

  it("rejects an activity that is not valid for the work package's project", async () => {
    llmProposal = updateProposal({
      timeEntry: { hours: 2, activityId: 999, spentOn: today },
      note: null,
      statusName: null,
    });

    const replies = await handleMessage(ctx(), "2h on the server");

    expect(replies[0].text).toContain("Which activity should I use?");
    expect(getDb().select().from(proposalsTable).all()).toHaveLength(0);
  });

  it("cancels an open proposal with no", async () => {
    await handleMessage(ctx(), "log 2h");
    expect(getDb().select().from(proposalsTable).all()[0].status).toBe("pending");

    const replies = await handleMessage(ctx(), "no");

    expect(replies[0].text).toBe("Cancelled. Nothing was changed.");
    expect(getDb().select().from(proposalsTable).all()[0].status).toBe("cancelled");
  });

  it("replaces an open proposal on the next free-text message", async () => {
    await handleMessage(ctx(), "log 2h");
    await handleMessage(ctx(), "log 3h");

    const rows = getDb().select().from(proposalsTable).all();
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.status === "cancelled")).toHaveLength(1);
    expect(rows.filter((row) => row.status === "pending")).toHaveLength(1);
  });

  it("expires an unanswered proposal and then confirms nothing", async () => {
    await handleMessage(ctx(), "log 2h");

    getDb()
      .update(proposalsTable)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .run();

    const replies = await handleMessage(ctx(), "yes");

    expect(replies[0].text).toBe("Nothing to confirm.");
    expect(getDb().select().from(proposalsTable).all()[0].status).toBe("expired");
  });

  it("declines messages that are not about a work package", async () => {
    llmProposal = {
      kind: "unrelated",
      workPackageId: null,
      timeEntry: null,
      note: null,
      statusName: null,
      clarification: null,
    };

    const replies = await handleMessage(ctx(), "what's the weather like?");

    expect(replies[0].text).toContain("I can only help with logging time");
    expect(getDb().select().from(proposalsTable).all()).toHaveLength(0);
  });
});
