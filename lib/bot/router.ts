export type BotCommand =
  | { kind: "help" }
  | { kind: "my-day" }
  | { kind: "yes" }
  | { kind: "no" }
  | { kind: "undo" };

const ALIASES = new Map<string, BotCommand>([
  ["help", { kind: "help" }],
  ["?", { kind: "help" }],
  ["my day", { kind: "my-day" }],
  ["myday", { kind: "my-day" }],
  ["yes", { kind: "yes" }],
  ["y", { kind: "yes" }],
  ["ok", { kind: "yes" }],
  ["✅", { kind: "yes" }],
  ["no", { kind: "no" }],
  ["n", { kind: "no" }],
  ["cancel", { kind: "no" }],
  ["❌", { kind: "no" }],
  ["undo", { kind: "undo" }],
]);

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[!.]+$/, "")
    .trim();
}

/**
 * Matches deterministic commands. Only closed-form text matches, so free text
 * such as "help me log 2 hours" still goes to the proposal flow.
 */
export function matchCommand(text: string): BotCommand | undefined {
  return ALIASES.get(normalize(text));
}

/** A bare number is only meaningful while a clarification is open. */
export function parseSelection(text: string): number | undefined {
  const normalized = normalize(text);
  if (!/^[1-9]\d*$/.test(normalized)) return undefined;
  return Number(normalized);
}
