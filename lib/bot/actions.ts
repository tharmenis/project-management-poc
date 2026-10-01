import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { executedActions, type ExecutedAction } from "@/lib/db/schema";

export type ActionKind = "time_entry" | "comment" | "status";

export interface RecordActionInput {
  proposalId: string;
  userId: string;
  kind: ActionKind;
  opObjectId?: string | null;
  undoJson?: unknown;
  executedAt?: string;
}

export function recordAction(input: RecordActionInput): ExecutedAction {
  const row: ExecutedAction = {
    id: randomUUID(),
    proposalId: input.proposalId,
    userId: input.userId,
    kind: input.kind,
    opObjectId: input.opObjectId ?? null,
    undoJson: input.undoJson ?? null,
    executedAt: input.executedAt ?? new Date().toISOString(),
    undoneAt: null,
  };

  getDb().insert(executedActions).values(row).run();
  return row;
}

export function getActionsForProposal(proposalId: string): ExecutedAction[] {
  return getDb()
    .select()
    .from(executedActions)
    .where(eq(executedActions.proposalId, proposalId))
    .all();
}

export interface UndoableProposal {
  proposalId: string;
  executedAt: string;
  actions: ExecutedAction[];
}

/** The actions of the user's most recent executed proposal that are not undone. */
export function getUndoableProposal(userId: string): UndoableProposal | undefined {
  const latest = getDb()
    .select()
    .from(executedActions)
    .where(and(eq(executedActions.userId, userId), isNull(executedActions.undoneAt)))
    .orderBy(desc(executedActions.executedAt))
    .get();

  if (!latest) return undefined;

  const actions = getActionsForProposal(latest.proposalId).filter(
    (action) => action.undoneAt === null,
  );
  if (actions.length === 0) return undefined;

  const executedAt = [...actions.map((action) => action.executedAt)].sort().at(-1);
  if (!executedAt) return undefined;

  return { proposalId: latest.proposalId, executedAt, actions };
}

export function markActionUndone(id: string, undoneAt: string = new Date().toISOString()): void {
  getDb().update(executedActions).set({ undoneAt }).where(eq(executedActions.id, id)).run();
}
