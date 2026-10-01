import { recordAudit } from "@/lib/audit";
import { getConfig } from "@/lib/config";
import { addComment, retractComment, RETRACTED_TEXT } from "@/lib/openproject/activities";
import { OpenProjectError, botMessageForError } from "@/lib/openproject/errors";
import { deleteTimeEntry } from "@/lib/openproject/timeEntries";
import { revertStatus } from "@/lib/openproject/workPackages";
import { clientForUser, findUser } from "@/lib/users";
import { getUndoableProposal, markActionUndone, type ActionKind } from "./actions";
import { linkRequiredText, nothingToUndoText, undoResultText, undoWindowText } from "./messages";
import type { ExecutedAction } from "@/lib/db/schema";
import type { BotReply, MessageContext } from "./types";

/** Reverse of the fixed execution order. */
const UNDO_ORDER: ActionKind[] = ["status", "comment", "time_entry"];

const LABELS: Record<ActionKind, string> = {
  time_entry: "time entry",
  comment: "note",
  status: "status",
};

interface UndoJson {
  timeEntryId?: number;
  workPackageId?: number;
  activityId?: number;
  previousStatusHref?: string;
}

export async function undoLast(ctx: MessageContext): Promise<BotReply[]> {
  const user = findUser(ctx.userId);
  if (!user) return [{ text: linkRequiredText }];

  const last = getUndoableProposal(ctx.userId);
  if (!last) return [{ text: nothingToUndoText }];

  const config = getConfig();
  if (isOutsideWindow(last.executedAt, config.UNDO_WINDOW_MINUTES)) {
    return [{ text: undoWindowText(config.UNDO_WINDOW_MINUTES) }];
  }

  const client = clientForUser(user);
  const results: { label: string; ok: boolean; reason?: string; detail?: string }[] = [];

  for (const kind of UNDO_ORDER) {
    const action = last.actions.find((entry) => entry.kind === kind);
    if (!action) continue;

    try {
      const detail = await reverseAction(client, action);
      markActionUndone(action.id);
      results.push({ label: LABELS[kind], ok: true, detail });
    } catch (error) {
      results.push({ label: LABELS[kind], ok: false, reason: botMessageForError(error) });
    }
  }

  recordAudit({
    event: "undone",
    userId: ctx.userId,
    channel: ctx.channel,
    payload: { proposalId: last.proposalId, results },
  });

  return [{ text: undoResultText(results) }];
}

function isOutsideWindow(executedAt: string, windowMinutes: number): boolean {
  return Date.now() - Date.parse(executedAt) > windowMinutes * 60_000;
}

async function reverseAction(
  client: ReturnType<typeof clientForUser>,
  action: ExecutedAction,
): Promise<string | undefined> {
  const undo = (action.undoJson ?? {}) as UndoJson;

  switch (action.kind) {
    case "status":
      if (undo.workPackageId !== undefined && undo.previousStatusHref) {
        await revertStatus(client, undo.workPackageId, undo.previousStatusHref);
      }
      return undefined;

    case "comment":
      if (undo.activityId === undefined) return undefined;
      try {
        await retractComment(client, undo.activityId);
        return undefined;
      } catch (error) {
        // Some OpenProject versions reject editing an activity. Fall back to
        // marking it as retracted rather than leaving the note in place.
        if (isUnsupportedEdits(error) && undo.workPackageId !== undefined) {
          await addComment(client, undo.workPackageId, RETRACTED_TEXT);
          return "marked as retracted, because this OpenProject version doesn't allow editing comments";
        }
        throw error;
      }

    case "time_entry":
      if (undo.timeEntryId !== undefined) {
        await deleteTimeEntry(client, undo.timeEntryId);
      }
      return undefined;
  }
}

function isUnsupportedEdits(error: unknown): boolean {
  return (
    error instanceof OpenProjectError &&
    (error.kind === "validation" || error.kind === "unknown")
  );
}
