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
import { executedActions, proposals as proposalsTable } from "@/lib/db/schema";
import { linkUser } from "@/lib/users";
import { server } from "./msw/server";

const DB_PATH = join(tmpdir(), `poc-bot-test-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = DB_PATH;

const BASE = "http://localhost:8080";
const LLM = "http://llm.test/chat/completions";

let userId: string;
let today: string;
let llmProposal: Record<string, unknown>;

let timeEntryBodies: Record<string, unknown>[];
let commentBodies: Record<string, unknown>[];
let patchBodies: Record<string, unknown>[];
let deletedIds: string[];
let patchAttempts: number;
let failFirstPatch: boolean;
let commentStatus = 201;

const ctx = () => ({ userId, channel: "repl", clientMessageId: randomUUID() }) as const;

const WORK_PACKAGE = {
  id: 82,
  subject: "Rack mount server & cabling",
  startDate: "2026-10-01",
  dueDate: "2026-10-01",
  lockVersion: 3,
  _links: {
    project: { href: "/api/v3/projects/37", title: "Acme – File server installation" },
    status: { href: "/api/v3/statuses/7", title: "In progress" },
    type: { href: "/api/v3/types/1", title: "Task" },
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

const activitiesForm = {
  _embedded: {
    schema: {
      activity: {
        _links: { allowedValues: [{ href: "/api/v3/time_entries/activities/3", title: "On-site" }] },
      },
    },
  },
};

function installDefaults() {
  server.use(
    http.get(`${BASE}/api/v3/users/me`, () =>
      HttpResponse.json({ id: 7, name: "Pilot User", login: "pilot" }),
    ),
    http.get(`${BASE}/api/v3/work_packages`, () =>
      HttpResponse.json({ _embedded: { elements: [WORK_PACKAGE] } }),
    ),
    http.get(`${BASE}/api/v3/work_packages/:id`, () => HttpResponse.json(WORK_PACKAGE)),
    http.post(`${BASE}/api/v3/work_packages/:id/form`, () => HttpResponse.json(statusForm)),
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
    http.post(LLM, () =>
      HttpResponse.json({
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: JSON.stringify(llmProposal) },
            finish_reason: "stop",
          },
        ],
      }),
    ),
    http.post(`${BASE}/api/v3/time_entries`, async ({ request }) => {
      timeEntryBodies.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json({ id: 555 });
    }),
    http.post(`${BASE}/api/v3/work_packages/:id/activities`, async ({ request }) => {
      commentBodies.push((await request.json()) as Record<string, unknown>);
      return new HttpResponse(JSON.stringify({ id: 777 }), {
        status: commentStatus,
        headers: { "Content-Type": "application/json" },
      });
    }),
    http.patch(`${BASE}/api/v3/work_packages/:id`, async ({ request }) => {
      patchAttempts += 1;
      patchBodies.push((await request.json()) as Record<string, unknown>);
      if (failFirstPatch && patchAttempts === 1) {
        return new HttpResponse(null, { status: 409 });
      }
      return HttpResponse.json({ id: 82 });
    }),
    http.patch(`${BASE}/api/v3/activities/:id`, () => HttpResponse.json({ id: 777 })),
    http.delete(`${BASE}/api/v3/time_entries/:id`, ({ params }) => {
      deletedIds.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

function resetCalls() {
  timeEntryBodies = [];
  commentBodies = [];
  patchBodies = [];
  deletedIds = [];
  patchAttempts = 0;
  failFirstPatch = false;
  commentStatus = 201;
}

async function proposeForConfirmation() {
  llmProposal = {
    kind: "update",
    workPackageId: 82,
    timeEntry: { hours: 2, activityId: 3, spentOn: today },
    note: "Replaced the PSU; server back online.",
    statusName: "Closed",
    clarification: null,
  };
  return handleMessage(ctx(), "2h on-site at the file server, replaced the PSU, done");
}

beforeAll(async () => {
  migrate(getDb(), { migrationsFolder: "./drizzle" });
  today = todayInZone(getConfig().APP_TIMEZONE);
  installDefaults();
  const linked = await linkUser({ token: "pilot-token" });
  userId = linked.id;
});

beforeEach(() => {
  resetCalls();
  installDefaults();
});

afterEach(() => {
  getDb().delete(executedActions).run();
  getDb().delete(proposalsTable).run();
});

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
});

describe("executor", () => {
  it("writes the time entry, note and status after yes", async () => {
    await proposeForConfirmation();

    const replies = await handleMessage(ctx(), "yes");

    expect(replies[0].text).toContain(
      "Saved on #82 Rack mount server & cabling (Acme – File server installation): 2 h logged, note added, status Closed.",
    );
    expect(replies[0].text).toContain('Say "undo" within 30 minutes');
    expect(replies[0].actions).toEqual([{ label: "Undo", value: "undo" }]);

    expect(timeEntryBodies[0]).toMatchObject({
      hours: "PT2H",
      spentOn: today,
      _links: {
        workPackage: { href: "/api/v3/work_packages/82" },
        activity: { href: "/api/v3/time_entries/activities/3" },
      },
    });
    expect(JSON.stringify(commentBodies[0])).toContain("Replaced the PSU");
    expect(JSON.stringify(commentBodies[0])).toContain("(via chat bot)");
    expect(patchBodies[0]).toMatchObject({
      lockVersion: 3,
      _links: { status: { href: "/api/v3/statuses/12" } },
    });

    const actions = getDb().select().from(executedActions).all();
    expect(actions.map((action) => action.kind).sort()).toEqual([
      "comment",
      "status",
      "time_entry",
    ]);
    expect(actions.find((action) => action.kind === "time_entry")?.undoJson).toEqual({
      timeEntryId: 555,
    });
    expect(actions.find((action) => action.kind === "status")?.undoJson).toEqual({
      workPackageId: 82,
      previousStatusHref: "/api/v3/statuses/7",
    });

    expect(getDb().select().from(proposalsTable).all()[0].status).toBe("confirmed");
  });

  it("keeps successful parts and reports the ones that failed", async () => {
    commentStatus = 500;
    await proposeForConfirmation();

    const replies = await handleMessage(ctx(), "yes");

    expect(replies[0].text).toContain("Saved on #82 Rack mount server & cabling");
    expect(replies[0].text).toContain("2 h logged, status Closed");
    expect(replies[0].text).toContain("Not saved: note.");
    expect(replies[0].text).toContain("• note: OpenProject isn't reachable right now");

    const actions = getDb().select().from(executedActions).all();
    expect(actions.map((action) => action.kind).sort()).toEqual(["status", "time_entry"]);
  });

  it("retries once on a 409 edit conflict", async () => {
    failFirstPatch = true;
    await proposeForConfirmation();

    const replies = await handleMessage(ctx(), "yes");

    expect(patchAttempts).toBe(2);
    expect(replies[0].text).toContain("status Closed");
  });
});

describe("undo", () => {
  it("reverses the last executed proposal in reverse order", async () => {
    await proposeForConfirmation();
    await handleMessage(ctx(), "yes");
    resetCalls();

    const replies = await handleMessage(ctx(), "undo");

    expect(replies[0].text).toBe("Reversed:\n• status: reversed\n• note: reversed\n• time entry: reversed");
    expect(JSON.stringify(patchBodies[0])).toContain("/api/v3/statuses/7");
    expect(deletedIds).toEqual(["555"]);

    const actions = getDb().select().from(executedActions).all();
    expect(actions.every((action) => action.undoneAt !== null)).toBe(true);
  });

  it("marks a note as retracted when the instance refuses to edit comments", async () => {
    await proposeForConfirmation();
    await handleMessage(ctx(), "yes");
    resetCalls();
    server.use(
      http.patch(`${BASE}/api/v3/activities/:id`, () => new HttpResponse(null, { status: 400 })),
    );

    const replies = await handleMessage(ctx(), "undo");

    expect(replies[0].text).toContain("note: marked as retracted");
    expect(JSON.stringify(commentBodies.at(-1))).toContain("Retracted by the author via chat bot");
  });

  it("refuses once the undo window has passed", async () => {
    await proposeForConfirmation();
    await handleMessage(ctx(), "yes");

    const longAgo = new Date(Date.now() - 45 * 60_000).toISOString();
    getDb().update(executedActions).set({ executedAt: longAgo }).run();

    const replies = await handleMessage(ctx(), "undo");

    expect(replies[0].text).toBe("You can only undo within 30 minutes of a change.");
  });

  it("says there is nothing to undo when nothing was executed", async () => {
    const replies = await handleMessage(ctx(), "undo");

    expect(replies[0].text).toBe("Nothing to undo.");
  });
});
