import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { handleMessage } from "@/lib/bot";
import { getRecentWorkPackage } from "@/lib/bot/proposals";
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
let prompts: string[];

const ctx = () => ({ userId, channel: "repl", clientMessageId: randomUUID() }) as const;

const workPackage = (id: number, subject: string, projectId: number, projectName: string) => ({
  id,
  subject,
  startDate: "2026-10-01",
  dueDate: "2026-10-01",
  lockVersion: 1,
  _links: {
    project: { href: `/api/v3/projects/${projectId}`, title: projectName },
    status: { href: "/api/v3/statuses/7", title: "New" },
    type: { href: "/api/v3/types/1", title: "Task" },
  },
});

const WORK_PACKAGES = [
  workPackage(2, "Organize open source conference", 1, "Demo project"),
  workPackage(17, "New website", 2, "Scrum project"),
  workPackage(82, "Rack mount server & cabling", 37, "Acme – File server installation"),
  workPackage(84, "Migrate shares & NTFS permissions", 37, "Acme – File server installation"),
];

const activitiesForm = {
  _embedded: {
    schema: {
      activity: {
        _links: { allowedValues: [{ href: "/api/v3/time_entries/activities/3", title: "Development" }] },
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
      HttpResponse.json({ _embedded: { elements: WORK_PACKAGES } }),
    ),
    http.get(`${BASE}/api/v3/work_packages/:id`, ({ params }) =>
      HttpResponse.json(WORK_PACKAGES.find((entry) => entry.id === Number(params.id))),
    ),
    http.post(`${BASE}/api/v3/time_entries/form`, () => HttpResponse.json(activitiesForm)),
    http.get(`${BASE}/api/v3/statuses`, () =>
      HttpResponse.json({ _embedded: { elements: [{ id: 7, name: "New" }] } }),
    ),
    http.post(`${BASE}/api/v3/work_packages/:id/form`, () =>
      HttpResponse.json({
        _embedded: { schema: { status: { _links: { allowedValues: [{ href: "/api/v3/statuses/7", title: "New" }] } } } },
      }),
    ),
    http.post(LLM, async ({ request }) => {
      prompts.push(JSON.stringify(await request.json()));
      return HttpResponse.json({
        choices: [
          { index: 0, message: { role: "assistant", content: JSON.stringify(llmProposal) }, finish_reason: "stop" },
        ],
      });
    }),
  );
}

const lastPrompt = () => prompts.at(-1) ?? "";

beforeAll(async () => {
  migrate(getDb(), { migrationsFolder: "./drizzle" });
  today = todayInZone(getConfig().APP_TIMEZONE);
  installDefaults();
  const linked = await linkUser({ token: "pilot-token" });
  userId = linked.id;
});

beforeEach(() => {
  prompts = [];
  llmProposal = {
    kind: "update",
    workPackageId: 84,
    timeEntry: { hours: 2, activityId: 3, spentOn: today },
    note: null,
    statusName: null,
    clarification: null,
  };
  installDefaults();
});

afterEach(() => {
  getDb().delete(proposalsTable).run();
});

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
});

describe("candidate scoping", () => {
  it("sends only the named project's work packages", async () => {
    await handleMessage(ctx(), "1h on the file server installation project");

    expect(lastPrompt()).toContain("#82");
    expect(lastPrompt()).toContain("#84");
    expect(lastPrompt()).not.toContain("Organize open source conference");
    expect(lastPrompt()).not.toContain("New website");
  });

  it("keeps the full set when the message names no project", async () => {
    await handleMessage(ctx(), "did some work");

    expect(lastPrompt()).toContain("Organize open source conference");
    expect(lastPrompt()).toContain("New website");
    expect(lastPrompt()).toContain("#84");
  });

  it("narrows to the work package from the previous message", async () => {
    await handleMessage(ctx(), "2h on migrate shares");

    await handleMessage(ctx(), "make that 3 hours");

    expect(lastPrompt()).toContain("refers to #84");
    expect(lastPrompt()).not.toContain("Organize open source conference");
  });
  it("remembers the work package after a follow-up question", async () => {
    llmProposal = {
      kind: "update",
      workPackageId: 84,
      timeEntry: { hours: 2, activityId: null, spentOn: today },
      note: null,
      statusName: null,
      clarification: null,
    };
    await handleMessage(ctx(), "2h on migrate shares");

    await handleMessage(ctx(), "Development");

    expect(lastPrompt()).toContain("recently working on #84");
  });
});

describe("getRecentWorkPackage", () => {
  it("returns the work package from the most recent proposal", async () => {
    await handleMessage(ctx(), "2h on migrate shares");

    expect(getRecentWorkPackage(userId, 30)).toMatchObject({
      id: 84,
      subject: "Migrate shares & NTFS permissions",
      projectId: 37,
    });
  });

  it("forgets it once the window has passed", async () => {
    await handleMessage(ctx(), "2h on migrate shares");

    const longAgo = new Date(Date.now() - 60 * 60_000).toISOString();
    getDb().update(proposalsTable).set({ createdAt: longAgo }).run();

    expect(getRecentWorkPackage(userId, 30)).toBeUndefined();
  });

  it("has nothing to return for a fresh user", () => {
    expect(getRecentWorkPackage(userId, 30)).toBeUndefined();
  });
});
