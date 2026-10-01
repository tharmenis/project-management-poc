import { recordAudit } from "@/lib/audit";
import { getConfig } from "@/lib/config";
import { addComment } from "@/lib/openproject/activities";
import { botMessageForError } from "@/lib/openproject/errors";
import { createTimeEntry } from "@/lib/openproject/timeEntries";
import { changeStatus } from "@/lib/openproject/workPackages";
import { clientForUser, findUser } from "@/lib/users";
import { recordAction } from "./actions";
import { linkRequiredText, resultText, workPackageLabel } from "./messages";
import { readCandidates, readProposal, resolveProposal, type ProposalRow } from "./proposals";
import type { BotReply, MessageContext } from "./types";
import type { ValidatedProposal } from "./validate";

/**
 * Writes a confirmed proposal to OpenProject in a fixed order (time entry, then
 * comment, then status). Parts that succeed are kept and recorded for undo;
 * parts that fail are reported individually.
 */
export async function executeProposal(
  ctx: MessageContext,
  proposalRow: ProposalRow,
): Promise<BotReply[]> {
  const user = findUser(ctx.userId);
  if (!user) return [{ text: linkRequiredText }];

  const config = getConfig();
  const client = clientForUser(user);
  const proposal = readProposal<ValidatedProposal>(proposalRow);
  const workPackage = readCandidates(proposalRow).find(
    (candidate) => candidate.id === proposal.workPackageId,
  );
  const label = workPackage ? workPackageLabel(workPackage) : `#${proposal.workPackageId}`;

  const saved: string[] = [];
  const failed: { label: string; reason: string }[] = [];

  if (proposal.timeEntry) {
    try {
      const { id } = await createTimeEntry(client, {
        workPackageId: proposal.workPackageId,
        activityId: proposal.timeEntry.activityId,
        hours: proposal.timeEntry.hours,
        spentOn: proposal.timeEntry.spentOn,
      });
      recordAction({
        proposalId: proposalRow.id,
        userId: ctx.userId,
        kind: "time_entry",
        opObjectId: String(id),
        undoJson: { timeEntryId: id },
      });
      saved.push(`${proposal.timeEntry.hours} h logged`);
    } catch (error) {
      failed.push({ label: "time entry", reason: botMessageForError(error) });
    }
  }

  if (proposal.note) {
    try {
      const { activityId } = await addComment(
        client,
        proposal.workPackageId,
        proposal.note,
        config.BOT_COMMENT_SUFFIX,
      );
      recordAction({
        proposalId: proposalRow.id,
        userId: ctx.userId,
        kind: "comment",
        opObjectId: String(activityId),
        undoJson: { workPackageId: proposal.workPackageId, activityId },
      });
      saved.push("note added");
    } catch (error) {
      failed.push({ label: "note", reason: botMessageForError(error) });
    }
  }

  if (proposal.status) {
    try {
      const { previousStatusHref } = await changeStatus(
        client,
        proposal.workPackageId,
        proposal.status.id,
      );
      recordAction({
        proposalId: proposalRow.id,
        userId: ctx.userId,
        kind: "status",
        opObjectId: String(proposal.workPackageId),
        undoJson: { workPackageId: proposal.workPackageId, previousStatusHref },
      });
      saved.push(`status ${proposal.status.name}`);
    } catch (error) {
      failed.push({ label: "status", reason: botMessageForError(error) });
    }
  }

  resolveProposal(proposalRow.id, saved.length > 0 ? "confirmed" : "failed");

  recordAudit({
    event: "confirmed",
    userId: ctx.userId,
    channel: ctx.channel,
    payload: { proposalId: proposalRow.id, saved, failed },
  });

  if (saved.length > 0) {
    recordAudit({
      event: "executed",
      userId: ctx.userId,
      channel: ctx.channel,
      payload: { proposalId: proposalRow.id, workPackageId: proposal.workPackageId, saved },
    });
  }
  for (const part of failed) {
    recordAudit({
      event: "error",
      userId: ctx.userId,
      channel: ctx.channel,
      payload: { proposalId: proposalRow.id, part: part.label },
      error: part.reason,
    });
  }

  const text = resultText({ label, saved, failed, undoWindowMinutes: config.UNDO_WINDOW_MINUTES });
  return saved.length > 0
    ? [{ text, actions: [{ label: "Undo", value: "undo" }] }]
    : [{ text }];
}
