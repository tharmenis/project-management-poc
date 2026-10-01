import { describe, expect, it } from "vitest";
import { proposalSchema } from "@/lib/llm/schema";

describe("proposalSchema", () => {
  it("treats omitted nullable fields as null", () => {
    const parsed = proposalSchema.parse({ kind: "unrelated" });

    expect(parsed).toEqual({
      kind: "unrelated",
      workPackageId: null,
      timeEntry: null,
      note: null,
      statusName: null,
      clarification: null,
    });
  });

  it("keeps at most three clarification options", () => {
    const parsed = proposalSchema.parse({
      kind: "clarify",
      clarification: { question: "Which one?", optionWorkPackageIds: [2, 6, 7, 8] },
    });

    expect(parsed.clarification?.optionWorkPackageIds).toEqual([2, 6, 7]);
  });

  it("ignores unknown keys", () => {
    const parsed = proposalSchema.parse({ kind: "update", workPackageId: 82, confidence: 0.9 });

    expect(parsed.workPackageId).toBe(82);
  });

  it("requires a kind", () => {
    expect(() => proposalSchema.parse({ workPackageId: 82 })).toThrow();
  });

  it("rejects hours outside 0-24", () => {
    expect(() =>
      proposalSchema.parse({ kind: "update", timeEntry: { hours: 30, spentOn: "2026-10-01" } }),
    ).toThrow();
  });
});
