export interface Candidate {
  id: number;
  subject: string;
  projectId?: number;
  projectName?: string;
}

export interface Focus {
  workPackageId?: number;
  projectId?: number;
}

export interface RecentWorkPackage {
  id: number;
  subject: string;
  projectId?: number;
  projectName?: string;
}

const MIN_TOKEN_LENGTH = 3;

/** Only a project must clear this to be narrowed to; ambiguous stays ambiguous. */
const MIN_PROJECT_SCORE = 0.3;
const MIN_PROJECT_MARGIN = 0.15;

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "for",
  "on",
  "in",
  "at",
  "to",
  "from",
  "with",
  "my",
  "me",
  "i",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "project",
  "task",
  "work",
  "package",
  "hours",
  "hour",
  "hrs",
  "log",
  "logged",
  "logging",
  "spent",
  "did",
  "do",
  "add",
  "added",
  "note",
  "notes",
  "status",
  "set",
  "change",
  "changed",
  "today",
  "yesterday",
  "tomorrow",
]);

const REFERRING = /\b(that|it|this|same|again|also|those|these)\b/;

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (token) => token.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(token),
  );
}

export function hasReferringToken(text: string): boolean {
  return REFERRING.test(text.toLowerCase());
}

export function detectExplicitWorkPackageId(text: string): number | undefined {
  const match = text.match(/#(\d+)/);
  if (!match) return undefined;

  const id = Number(match[1]);
  return Number.isInteger(id) ? id : undefined;
}

function overlap(messageTokens: Set<string>, candidateTokens: string[]): number {
  if (candidateTokens.length === 0) return 0;
  const matched = candidateTokens.filter((token) => messageTokens.has(token)).length;
  return matched / candidateTokens.length;
}

/**
 * The project the message most plausibly names, scored by how much of a project
 * name or of one of its work package subjects appears in the message. Returns
 * nothing when the best candidate is weak or too close to the runner-up.
 */
export function detectProject(candidates: Candidate[], message: string): number | undefined {
  const messageTokens = new Set(tokenize(message));
  if (messageTokens.size === 0) return undefined;

  const scores = new Map<number, number>();
  for (const candidate of candidates) {
    if (candidate.projectId === undefined) continue;

    const score = Math.max(
      overlap(messageTokens, tokenize(candidate.projectName ?? "")),
      overlap(messageTokens, tokenize(candidate.subject)),
    );
    scores.set(candidate.projectId, Math.max(scores.get(candidate.projectId) ?? 0, score));
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const winner = ranked[0];
  if (!winner || winner[1] < MIN_PROJECT_SCORE) return undefined;

  const runnerUp = ranked[1];
  if (runnerUp && winner[1] - runnerUp[1] < MIN_PROJECT_MARGIN) return undefined;

  return winner[0];
}

/** Stably orders candidates by how much of the message each one accounts for. */
export function rankCandidates<T extends Candidate>(candidates: T[], message?: string): T[] {
  if (!message) return candidates;

  const messageTokens = new Set(tokenize(message));
  if (messageTokens.size === 0) return candidates;

  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      score: overlap(messageTokens, tokenize(candidate.subject)),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.candidate);
}

/**
 * Precedence: an explicit "#123", then a confidently named project, then a
 * reference to the task from the previous message ("make that 3 hours").
 */
export function resolveFocus(
  text: string,
  candidates: Candidate[],
  memory?: RecentWorkPackage,
): Focus | undefined {
  const explicit = detectExplicitWorkPackageId(text);
  if (explicit !== undefined && candidates.some((candidate) => candidate.id === explicit)) {
    return { workPackageId: explicit };
  }

  const projectId = detectProject(candidates, text);
  if (projectId !== undefined) return { projectId };

  if (memory && hasReferringToken(text) && candidates.some((c) => c.id === memory.id)) {
    return { workPackageId: memory.id };
  }

  return undefined;
}

export function applyFocus<T extends Candidate>(candidates: T[], focus?: Focus): T[] {
  if (!focus) return candidates;

  if (focus.workPackageId !== undefined) {
    const hit = candidates.filter((candidate) => candidate.id === focus.workPackageId);
    if (hit.length > 0) return hit;
  }

  if (focus.projectId !== undefined) {
    const hit = candidates.filter((candidate) => candidate.projectId === focus.projectId);
    if (hit.length > 0) return hit;
  }

  return candidates;
}
