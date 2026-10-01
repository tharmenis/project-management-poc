import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { OpenProjectClient } from "@/lib/openproject/client";
import { OpenProjectError, botMessageForError, type OpenProjectErrorKind } from "@/lib/openproject/errors";
import { candidateFilters, listWorkPackages, getCurrentUser } from "@/lib/openproject/workPackages";
import { extractActivities, listTimeEntryActivities } from "@/lib/openproject/timeEntries";
import { server } from "./msw/server";

const BASE = "http://localhost:8080";
const EXPECTED_AUTH = `Basic ${Buffer.from("apikey:secret").toString("base64")}`;

function client() {
  return new OpenProjectClient({ baseUrl: BASE, token: "secret" });
}

describe("OpenProject client", () => {
  it("authenticates with the apikey basic scheme and parses the current user", async () => {
    server.use(
      http.get(`${BASE}/api/v3/users/me`, ({ request }) => {
        expect(request.headers.get("authorization")).toBe(EXPECTED_AUTH);
        return HttpResponse.json({ id: 7, name: "Pilot User", login: "pilot" });
      }),
    );

    await expect(getCurrentUser(client())).resolves.toEqual({
      id: 7,
      name: "Pilot User",
      login: "pilot",
    });
  });

  it("parses a work package collection and its project", async () => {
    server.use(
      http.get(`${BASE}/api/v3/work_packages`, ({ request }) => {
        expect(request.url).toContain("pageSize=50");
        return HttpResponse.json({
          _embedded: {
            elements: [
              {
                id: 1234,
                subject: "File server installation",
                startDate: "2026-09-30",
                dueDate: "2026-10-02",
                lockVersion: 3,
                _links: {
                  project: { href: "/api/v3/projects/12", title: "Client X" },
                  status: { href: "/api/v3/statuses/7", title: "In progress" },
                  type: { href: "/api/v3/types/1", title: "Task" },
                },
              },
            ],
          },
        });
      }),
    );

    const workPackages = await listWorkPackages(client(), {
      filters: candidateFilters({ from: "2026-09-24", to: "2026-10-02" }),
    });

    expect(workPackages).toHaveLength(1);
    expect(workPackages[0]).toMatchObject({
      id: 1234,
      subject: "File server installation",
      projectId: 12,
      projectName: "Client X",
      statusName: "In progress",
    });
  });

  it("adds a project filter only when project ids are given", () => {
    const without = candidateFilters({ from: "2026-09-24", to: "2026-10-02" });
    const withProjects = candidateFilters({
      from: "2026-09-24",
      to: "2026-10-02",
      projectIds: [12, 15],
    });

    expect(without.some((filter) => "project" in filter)).toBe(false);
    expect(withProjects.some((filter) => "project" in filter)).toBe(true);
  });
});

describe("OpenProject error mapping", () => {
  it.each<[number, OpenProjectErrorKind, string]>([
    [401, "unauthorized", "Your OpenProject link needs renewing."],
    [403, "forbidden", "You don't have permission for that in OpenProject."],
    [404, "not_found", "That work package can't be found anymore."],
    [409, "conflict", "Someone else just changed it; please try again."],
    [500, "unavailable", "OpenProject isn't reachable right now; nothing was saved."],
  ])("maps %i to %s", async (status, kind, message) => {
    server.use(
      http.get(`${BASE}/api/v3/work_packages/1`, () => new HttpResponse(null, { status })),
    );

    const error = await client()
      .request("GET", "/work_packages/1")
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OpenProjectError);
    expect((error as OpenProjectError).kind).toBe(kind);
    expect(botMessageForError(error)).toBe(message);
  });

  it("reports the status code for an unmapped response", async () => {
    server.use(
      http.patch(`${BASE}/api/v3/activities/1`, () => new HttpResponse(null, { status: 405 })),
    );

    const error = await client()
      .request("PATCH", "/activities/1", { body: {} })
      .catch((caught: unknown) => caught);

    expect(botMessageForError(error)).toContain("405");
  });

  it("surfaces OpenProject's own validation message for 422", async () => {
    server.use(
      http.post(`${BASE}/api/v3/time_entries`, () =>
        HttpResponse.json(
          {
            message: "Validation error",
            _embedded: { errors: [{ message: "Hours is not a number" }] },
          },
          { status: 422 },
        ),
      ),
    );

    const error = await client()
      .request("POST", "/time_entries", { body: {} })
      .catch((caught: unknown) => caught);

    expect(botMessageForError(error)).toBe("Hours is not a number");
  });
});

describe("time entry activities", () => {
  const formResponse = {
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

  it("reads allowed values from the form schema", () => {
    expect(extractActivities(formResponse)).toEqual([
      { id: 3, name: "On-site" },
      { id: 4, name: "Remote" },
    ]);
  });

  it("requests the form for a project", async () => {
    server.use(
      http.post(`${BASE}/api/v3/time_entries/form`, async ({ request }) => {
        const body = (await request.json()) as { _links?: { project?: { href?: string } } };
        expect(body._links?.project?.href).toBe("/api/v3/projects/12");
        return HttpResponse.json(formResponse);
      }),
    );

    await expect(listTimeEntryActivities(client(), 12)).resolves.toHaveLength(2);
  });
});
