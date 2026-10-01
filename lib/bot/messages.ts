import type { BotAction } from "./types";

export interface WorkPackageSummary {
  id: number;
  subject: string;
  projectName?: string;
  statusName?: string;
}

export function helpText(): string {
  return [
    "I can help you with:",
    "• Log hours, add a note or change status — describe it in one message,",
    '  e.g. "2h on-site at the file server install, replaced the PSU, done".',
    '• "my day" — your open work packages for today.',
    '• "yes" / "no" — confirm or cancel a proposal I show you.',
    '• "undo" — reverse your last confirmed change.',
  ].join("\n");
}

export function myDayText(workPackages: WorkPackageSummary[], dateLabelText: string): string {
  if (workPackages.length === 0) {
    return `Nothing is assigned to you for today (${dateLabelText}).`;
  }

  const lines = workPackages.map((workPackage) => {
    const meta = [workPackage.statusName, workPackage.projectName].filter(Boolean).join(" · ");
    const line = `• #${workPackage.id} ${workPackage.subject}`;
    return meta ? `${line} — ${meta}` : line;
  });

  return [`Your day, ${dateLabelText}:`, ...lines].join("\n");
}

export function workPackageLabel(workPackage: WorkPackageSummary): string {
  const project = workPackage.projectName ? ` (${workPackage.projectName})` : "";
  return `#${workPackage.id} ${workPackage.subject}${project}`;
}

export interface ConfirmationInput {
  workPackage: WorkPackageSummary;
  timeEntry: { hours: number; activityName: string | null; spentOnLabel: string } | null;
  note: string | null;
  statusTransition: { from: string | null; to: string } | null;
}

export function confirmationText(input: ConfirmationInput): string {
  const header = input.timeEntry
    ? `Log this on ${workPackageLabel(input.workPackage)}?`
    : `Update ${workPackageLabel(input.workPackage)}?`;

  const bullets: string[] = [];

  if (input.timeEntry) {
    const parts = [`${input.timeEntry.hours} h`];
    if (input.timeEntry.activityName) parts.push(input.timeEntry.activityName);
    parts.push(input.timeEntry.spentOnLabel);
    bullets.push(`• Time: ${parts.join(", ")}`);
  }
  if (input.note) {
    bullets.push(`• Note: ${input.note}`);
  }
  if (input.statusTransition) {
    const from = input.statusTransition.from ?? "current";
    bullets.push(`• Status: ${from} → ${input.statusTransition.to}`);
  }

  return [header, ...bullets, "", "Reply yes or no."].join("\n");
}

export function confirmationActions(): BotAction[] {
  return [
    { label: "Confirm", value: "yes" },
    { label: "Cancel", value: "no" },
  ];
}

export function clarificationText(question: string, options: WorkPackageSummary[]): string {
  const lines = options.map((option, index) => `${index + 1}. ${workPackageLabel(option)}`);
  return [question, "", ...lines, "", "Reply with a number."].join("\n");
}

export function clarificationActions(options: WorkPackageSummary[]): BotAction[] {
  return options.map((option, index) => ({
    label: `#${option.id} ${option.subject}`,
    value: String(index + 1),
  }));
}

export const unrelatedText =
  'I can only help with logging time, notes and status on your work packages. Say "help" for examples.';

export const cancelledText = "Cancelled. Nothing was changed.";
export const nothingToConfirmText = "Nothing to confirm.";
export const nothingToCancelText = "Nothing to cancel.";
export const nothingToUndoText = "Nothing to undo.";
export const nothingToChooseText = "There's nothing to choose right now.";
export const linkRequiredText =
  "I don't have an OpenProject link for you yet. Link your API token first.";
export const unparsedText =
  'I couldn\'t turn that into an update. Could you rephrase it, or say "help" for examples.';

export function selectionInvalidText(count: number): string {
  return `Please reply with a number between 1 and ${count}.`;
}

export interface ResultInput {
  label: string;
  saved: string[];
  failed: { label: string; reason: string }[];
  undoWindowMinutes: number;
}

export function resultText(input: ResultInput): string {
  const lines: string[] = [
    input.saved.length > 0
      ? `Saved on ${input.label}: ${input.saved.join(", ")}.`
      : `Nothing was saved on ${input.label}.`,
  ];

  if (input.failed.length > 0) {
    lines.push(`Not saved: ${input.failed.map((part) => part.label).join(", ")}.`);
    for (const part of input.failed) {
      lines.push(`• ${part.label}: ${part.reason}`);
    }
  }

  if (input.saved.length > 0) {
    lines.push(`Say "undo" within ${input.undoWindowMinutes} minutes to reverse it.`);
  }

  return lines.join("\n");
}

export function undoResultText(
  results: { label: string; ok: boolean; reason?: string; detail?: string }[],
): string {
  const header =
    results.every((result) => result.ok) && results.every((result) => !result.detail)
      ? "Reversed:"
      : "Undo results:";
  const lines = results.map((result) => {
    if (!result.ok) return `• ${result.label}: not reversed — ${result.reason}`;
    return `• ${result.label}: ${result.detail ?? "reversed"}`;
  });
  return [header, ...lines].join("\n");
}

export function undoWindowText(windowMinutes: number): string {
  return `You can only undo within ${windowMinutes} minutes of a change.`;
}
