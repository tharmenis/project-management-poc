import { describe, expect, it } from "vitest";
import {
  applyFocus,
  detectExplicitWorkPackageId,
  detectProject,
  hasReferringToken,
  rankCandidates,
  resolveFocus,
  tokenize,
  type Candidate,
} from "@/lib/bot/relevance";

const CANDIDATES: Candidate[] = [
  { id: 2, subject: "Organize open source conference", projectId: 1, projectName: "Demo project" },
  { id: 7, subject: "Invite attendees to conference", projectId: 1, projectName: "Demo project" },
  { id: 8, subject: "Setup conference website", projectId: 1, projectName: "Demo project" },
  { id: 17, subject: "New website", projectId: 2, projectName: "Scrum project" },
  {
    id: 82,
    subject: "Rack mount server & cabling",
    projectId: 37,
    projectName: "Acme – File server installation",
  },
  {
    id: 84,
    subject: "Migrate shares & NTFS permissions",
    projectId: 37,
    projectName: "Acme – File server installation",
  },
];

describe("tokenize", () => {
  it("keeps meaningful words and drops stopwords and short tokens", () => {
    expect(tokenize("1h on the file server installation project")).toEqual([
      "file",
      "server",
      "installation",
    ]);
  });

  it("splits on punctuation and dashes", () => {
    expect(tokenize("Acme – File server")).toEqual(["acme", "file", "server"]);
  });
});

describe("detectProject", () => {
  it.each([
    ["1h on the file server installation project", 37],
    ["2h on migrate shares", 37],
    ["log 2h on the scrum project", 2],
    ["did some work on the conference", 1],
  ])("maps %j to project %i", (message, projectId) => {
    expect(detectProject(CANDIDATES, message)).toBe(projectId);
  });

  it.each([["did some work"], ["log hours"], ["anything at all"]])(
    "declines to narrow for %j",
    (message) => {
      expect(detectProject(CANDIDATES, message)).toBeUndefined();
    },
  );

  it("stays undecided when two projects score equally", () => {
    const ambiguous: Candidate[] = [
      { id: 1, subject: "Alpha work", projectId: 10, projectName: "Alpha" },
      { id: 2, subject: "Beta work", projectId: 20, projectName: "Beta" },
    ];

    expect(detectProject(ambiguous, "alpha beta")).toBeUndefined();
  });
});

describe("explicit ids", () => {
  it("reads #84", () => {
    expect(detectExplicitWorkPackageId("log 2h on #84")).toBe(84);
  });

  it("returns nothing when there is no id", () => {
    expect(detectExplicitWorkPackageId("log 2h")).toBeUndefined();
  });
});

describe("resolveFocus", () => {
  const memory = { id: 84, subject: "Migrate shares & NTFS permissions", projectId: 37 };

  it("prefers an explicit id", () => {
    expect(resolveFocus("log 2h on #82", CANDIDATES, memory)).toEqual({ workPackageId: 82 });
  });

  it("ignores an id that is not a candidate", () => {
    expect(resolveFocus("log 2h on #999", CANDIDATES)).toBeUndefined();
  });

  it("falls back to the named project", () => {
    expect(resolveFocus("1h on the file server installation project", CANDIDATES)).toEqual({
      projectId: 37,
    });
  });

  it("uses the remembered task when the message refers back to it", () => {
    expect(resolveFocus("make that 3 hours", CANDIDATES, memory)).toEqual({ workPackageId: 84 });
  });

  it("does not invent a focus without memory or a match", () => {
    expect(resolveFocus("make that 3 hours", CANDIDATES)).toBeUndefined();
    expect(resolveFocus("did some work", CANDIDATES, memory)).toBeUndefined();
  });
});

describe("hasReferringToken", () => {
  it.each([["make that 3 hours"], ["do the same again"], ["log it on the website"]])(
    "detects a reference in %j",
    (message) => {
      expect(hasReferringToken(message)).toBe(true);
    },
  );

  it("ignores a plain statement", () => {
    expect(hasReferringToken("2h on migrate shares")).toBe(false);
  });
});

describe("ranking and narrowing", () => {
  it("puts the best matching work package first", () => {
    const ranked = rankCandidates(CANDIDATES, "migrate shares");

    expect(ranked[0].id).toBe(84);
  });

  it("keeps the original order without a message", () => {
    expect(rankCandidates(CANDIDATES).map((candidate) => candidate.id)).toEqual(
      CANDIDATES.map((candidate) => candidate.id),
    );
  });

  it("narrows to one project or one work package", () => {
    expect(applyFocus(CANDIDATES, { projectId: 37 }).map((c) => c.id)).toEqual([82, 84]);
    expect(applyFocus(CANDIDATES, { workPackageId: 84 }).map((c) => c.id)).toEqual([84]);
    expect(applyFocus(CANDIDATES).map((c) => c.id)).toEqual(CANDIDATES.map((c) => c.id));
  });
});
