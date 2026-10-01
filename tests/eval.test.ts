import { describe, expect, it } from "vitest";
import {
  compareOutput,
  formatReport,
  overallAccuracy,
  parseExample,
  summarize,
  type ExampleResult,
} from "@/lib/eval";
import type { ProposalOutput } from "@/lib/llm/schema";

const output = (overrides: Partial<ProposalOutput> = {}): ProposalOutput => ({
  kind: "update",
  workPackageId: 82,
  timeEntry: { hours: 2, activityId: 3, spentOn: "2026-10-01" },
  note: null,
  statusName: null,
  clarification: null,
  ...overrides,
});

describe("parseExample", () => {
  it("collects only the expectations the line declares", () => {
    const example = parseExample(
      '{"userId":"4","date":"2026-10-01","text":"log 2h on #84","kind":"update","workPackageId":84,"hours":2}',
    );

    expect(example.userId).toBe("4");
    expect(example.text).toBe("log 2h on #84");
    expect(example.expectations).toEqual({ kind: "update", workPackageId: 84, hours: 2 });
    expect("activityId" in example.expectations).toBe(false);
  });

  it.each([
    ["not json", "invalid JSON"],
    ['{"date":"2026-10-01","text":"hi"}', "userId"],
    ['{"userId":"4","date":"10-01-2026","text":"hi"}', "date"],
    ['{"userId":"4","date":"2026-10-01","text":"hi","hours":"lots"}', "hours"],
  ])("rejects %s", (line, message) => {
    expect(() => parseExample(line)).toThrow(new RegExp(message));
  });
});

describe("compareOutput", () => {
  it("passes when every declared field matches", () => {
    const example = parseExample(
      '{"userId":"4","date":"2026-10-01","text":"log 2h on #82","kind":"update","workPackageId":82,"hours":2}',
    );

    const results = compareOutput(example, output());

    expect(results).toHaveLength(3);
    expect(results.every((entry) => entry.ok)).toBe(true);
  });

  it("flags the fields that differ", () => {
    const example = parseExample(
      '{"userId":"4","date":"2026-10-01","text":"log 2h on #84","workPackageId":84,"hours":2}',
    );

    const results = compareOutput(example, output());

    expect(results.find((entry) => entry.field === "workPackageId")).toMatchObject({
      expected: 84,
      actual: 82,
      ok: false,
    });
    expect(results.find((entry) => entry.field === "hours")?.ok).toBe(true);
  });

  it("treats a missing time entry as null", () => {
    const example = parseExample(
      '{"userId":"4","date":"2026-10-01","text":"2h","hours":2,"activityId":null}',
    );

    const results = compareOutput(example, output({ timeEntry: null }));

    expect(results.find((entry) => entry.field === "hours")).toMatchObject({
      expected: 2,
      actual: null,
      ok: false,
    });
    expect(results.find((entry) => entry.field === "activityId")).toMatchObject({
      expected: null,
      actual: null,
      ok: true,
    });
  });

  it("compares status names case-insensitively", () => {
    const example = parseExample(
      '{"userId":"4","date":"2026-10-01","text":"close it","statusName":"closed"}',
    );

    const results = compareOutput(example, output({ statusName: "Closed" }));

    expect(results[0].ok).toBe(true);
  });
});

describe("report", () => {
  const good = parseExample('{"userId":"4","date":"2026-10-01","text":"ok","workPackageId":82}');
  const bad = parseExample('{"userId":"4","date":"2026-10-01","text":"wrong one","workPackageId":84}');

  const results: ExampleResult[] = [
    { example: good, output: output(), results: compareOutput(good, output()) },
    { example: bad, output: output(), results: compareOutput(bad, output()) },
    { example: parseExample('{"userId":"4","date":"2026-10-01","text":"broken"}'), results: [], error: "boom" },
  ];

  it("summarizes per field and overall", () => {
    expect(summarize(results)).toEqual([{ field: "workPackageId", checked: 2, matched: 1 }]);
    expect(overallAccuracy(results)).toEqual({ checked: 2, matched: 1 });
  });

  it("lists the accuracy, the mismatch and the error", () => {
    const report = formatReport({ provider: "deepseek", model: "deepseek-v4-flash", results });

    expect(report).toContain("provider=deepseek model=deepseek-v4-flash");
    expect(report).toContain("workPackageId  1/2  50%");
    expect(report).toContain("overall        1/2  50%");
    expect(report).toContain('"wrong one"');
    expect(report).toContain("workPackageId: expected 84, got 82");
    expect(report).toContain('"broken": boom');
  });
});
