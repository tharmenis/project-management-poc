export interface PromptContext {
  today: string;
  weekday: string;
  candidates: {
    id: number;
    subject: string;
    projectId?: number;
    projectName?: string;
    typeName?: string;
    statusName?: string;
    startDate: string | null;
    dueDate: string | null;
  }[];
  activities: { id: number; name: string; projectId?: number; projectName?: string }[];
  statusNames: string[];
}

export function buildSystemPrompt(): string {
  return [
    "You convert a staff member's chat message into a single JSON object that proposes an update to OpenProject.",
    "An update can contain any of: a time entry, a work note, and a status change on one work package.",
    "",
    "Rules:",
    "- Use only work package IDs and activity IDs from the provided context. Never invent an ID.",
    '- If no candidate clearly matches, or two are equally plausible, return kind "clarify" with up to three option work package IDs and a short question.',
    "- If the activity cannot be inferred, set activityId to null.",
    '- Resolve relative dates ("yesterday", "Monday") against the given today. Default to today.',
    "- Write the note as a clean work note in the user's own language. Keep every fact and add none.",
    "- Messages may be in any language or mixed languages.",
    '- Return kind "unrelated" when the message is not about logging time, a note, or a status on a work package.',
    "- Set every unused field to null. Respond with a single JSON object.",
  ].join("\n");
}

export function buildUserPrompt(context: PromptContext, text: string, hint?: string): string {
  const candidates = context.candidates.map((candidate) => {
    const parts = [
      `#${candidate.id} ${candidate.subject}`,
      `project: ${candidate.projectName ?? "unknown"}`,
      `type: ${candidate.typeName ?? "unknown"}`,
      `status: ${candidate.statusName ?? "unknown"}`,
      `start: ${candidate.startDate ?? "-"}`,
      `due: ${candidate.dueDate ?? "-"}`,
    ];
    return `- ${parts.join(" | ")}`;
  });

  const activities = context.activities.map((activity) => {
    const project = activity.projectName ? ` (${activity.projectName})` : "";
    return `- ${activity.id} ${activity.name}${project}`;
  });
  const statuses = context.statusNames.map((name) => `- ${name}`);

  return [
    `Today is ${context.today} (${context.weekday}).`,
    "",
    "Candidate work packages (use only these IDs):",
    ...(candidates.length > 0 ? candidates : ["- (none)"]),
    "",
    "Time entry activities (ID name, project it applies to):",
    ...(activities.length > 0 ? activities : ["- (none)"]),
    "",
    "Statuses you may propose:",
    ...(statuses.length > 0 ? statuses : ["- (none)"]),
    "",
    ...(hint ? [hint, ""] : []),
    "User message:",
    text,
  ].join("\n");
}
