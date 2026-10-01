import { z } from "zod";
import type { ProposalOutput } from "@/lib/llm/schema";

export const EVAL_FIELDS = ["kind", "workPackageId", "hours", "activityId", "statusName"] as const;
export type EvalField = (typeof EVAL_FIELDS)[number];

export type FieldValue = string | number | null;

export interface EvalExample {
  userId: string;
  date: string;
  text: string;
  expectations: Partial<Record<EvalField, FieldValue>>;
}

const exampleSchema = z
  .object({
    userId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
    text: z.string().min(1),
  })
  .passthrough();

export function parseExample(line: string): EvalExample {
  const trimmed = line.trim();
  if (!trimmed) throw new Error("empty line");

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    throw new Error("invalid JSON");
  }

  const base = exampleSchema.parse(raw);
  const record = raw as Record<string, unknown>;

  const expectations: Partial<Record<EvalField, FieldValue>> = {};
  for (const field of EVAL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      expectations[field] = normalizeValue(record[field], field);
    }
  }

  return { userId: base.userId, date: base.date, text: base.text, expectations };
}

function normalizeValue(value: unknown, field: EvalField): FieldValue {
  if (value === null || value === undefined) return null;
  if (field === "kind" || field === "statusName") return String(value);

  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`"${field}" must be a number or null`);
  return number;
}

export interface FieldResult {
  field: EvalField;
  expected: FieldValue;
  actual: FieldValue;
  ok: boolean;
}

export interface ExampleResult {
  example: EvalExample;
  output?: ProposalOutput;
  results: FieldResult[];
  error?: string;
}

export function actualValues(output: ProposalOutput): Record<EvalField, FieldValue> {
  return {
    kind: output.kind,
    workPackageId: output.workPackageId,
    hours: output.timeEntry?.hours ?? null,
    activityId: output.timeEntry?.activityId ?? null,
    statusName: output.statusName,
  };
}

/** Only fields the example declares are compared. */
export function compareOutput(example: EvalExample, output: ProposalOutput): FieldResult[] {
  const actual = actualValues(output);

  return EVAL_FIELDS.filter((field) => field in example.expectations).map((field) => {
    const expected = example.expectations[field] ?? null;
    const got = actual[field];
    return { field, expected, actual: got, ok: isMatch(field, expected, got) };
  });
}

function isMatch(field: EvalField, expected: FieldValue, actual: FieldValue): boolean {
  if (expected === null || actual === null) return expected === actual;
  if (field === "kind") return String(expected) === String(actual);
  if (field === "statusName") {
    return String(expected).trim().toLowerCase() === String(actual).trim().toLowerCase();
  }
  return Number(expected) === Number(actual);
}

export interface FieldSummary {
  field: EvalField;
  checked: number;
  matched: number;
}

export function summarize(results: ExampleResult[]): FieldSummary[] {
  const summaries: FieldSummary[] = [];

  for (const field of EVAL_FIELDS) {
    const forField = results.flatMap((result) => result.results.filter((entry) => entry.field === field));
    if (forField.length === 0) continue;
    summaries.push({
      field,
      checked: forField.length,
      matched: forField.filter((entry) => entry.ok).length,
    });
  }

  return summaries;
}

export function overallAccuracy(results: ExampleResult[]): { checked: number; matched: number } {
  const all = results.flatMap((result) => result.results);
  return { checked: all.length, matched: all.filter((entry) => entry.ok).length };
}

export function formatReport(input: {
  provider: string;
  model: string;
  results: ExampleResult[];
}): string {
  const { provider, model, results } = input;
  const errors = results.filter((result) => result.error);
  const lines: string[] = [];

  lines.push(`Evaluation — provider=${provider} model=${model}`);
  lines.push(`Examples: ${results.length}   Errors: ${errors.length}`);
  lines.push("");

  lines.push("Field accuracy");
  for (const summary of summarize(results)) {
    lines.push(
      `  ${summary.field.padEnd(14)} ${summary.matched}/${summary.checked}  ${percent(summary.matched, summary.checked)}%`,
    );
  }
  const overall = overallAccuracy(results);
  lines.push(`  ${"overall".padEnd(14)} ${overall.matched}/${overall.checked}  ${percent(overall.matched, overall.checked)}%`);

  const mismatches = results.filter((result) => result.results.some((entry) => !entry.ok));
  lines.push("");
  lines.push(`Mismatches (${mismatches.length})`);
  if (mismatches.length === 0) {
    lines.push("  (none)");
  }
  mismatches.forEach((result, index) => {
    lines.push(`  ${index + 1}. "${result.example.text}"`);
    for (const entry of result.results.filter((field) => !field.ok)) {
      lines.push(
        `     ${entry.field}: expected ${display(entry.expected)}, got ${display(entry.actual)}`,
      );
    }
  });

  if (errors.length > 0) {
    lines.push("");
    lines.push(`Errors (${errors.length})`);
    for (const result of errors) {
      lines.push(`  - "${result.example.text}": ${result.error}`);
    }
  }

  return lines.join("\n");
}

function percent(matched: number, checked: number): number {
  return checked === 0 ? 0 : Math.round((matched / checked) * 100);
}

/**
 * Errors from generateObject carry the model's raw text, which is exactly what
 * you need when comparing prompts and models.
 */
export function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const text = (error as { text?: unknown } | null)?.text;

  if (typeof text === "string" && text.trim().length > 0) {
    const compact = text.replace(/\s+/g, " ").trim();
    return `${message} — raw output: ${compact.slice(0, 300)}`;
  }

  const cause = (error as { cause?: unknown } | null)?.cause;
  if (cause instanceof Error && cause.message !== message) {
    return `${message} — ${cause.message}`;
  }

  return message;
}

function display(value: FieldValue): string {
  return value === null ? "null" : String(value);
}
