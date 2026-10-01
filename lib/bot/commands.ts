import { recordAudit } from "@/lib/audit";
import { getConfig } from "@/lib/config";
import { dateLabel, todayInZone } from "@/lib/dates";
import { listWorkPackages, myDayFilters, type OpWorkPackage } from "@/lib/openproject/workPackages";
import { clientForUser, findUser } from "@/lib/users";
import {
  cancelledText,
  helpText,
  linkRequiredText,
  myDayText,
  nothingToCancelText,
  nothingToConfirmText,
} from "./messages";
import { executeProposal } from "./execute";
import { undoLast } from "./undo";
import { cancelOpenProposals, getOpenProposal } from "./proposals";
import type { BotCommand } from "./router";
import type { BotReply, MessageContext } from "./types";

export async function runCommand(ctx: MessageContext, command: BotCommand): Promise<BotReply[]> {
  switch (command.kind) {
    case "help":
      return runHelp(ctx);
    case "my-day":
      return runMyDay(ctx);
    case "yes":
      return runYes(ctx);
    case "no":
      return runNo(ctx);
    case "undo":
      return runUndo(ctx);
  }
}

function runHelp(ctx: MessageContext): BotReply[] {
  recordAudit({
    event: "command",
    userId: ctx.userId,
    channel: ctx.channel,
    payload: { command: "help" },
  });
  return [{ text: helpText() }];
}

async function runMyDay(ctx: MessageContext): Promise<BotReply[]> {
  return myDayReplies(ctx);
}

/** Used by the "my day" command and by the web page when it opens. */
export async function myDayReplies(ctx: MessageContext): Promise<BotReply[]> {
  const user = findUser(ctx.userId);
  if (!user) {
    return [{ text: linkRequiredText }];
  }

  const config = getConfig();
  const today = todayInZone(config.APP_TIMEZONE);
  const client = clientForUser(user);
  const workPackages = sortForMyDay(
    await listWorkPackages(client, { filters: myDayFilters(today) }),
  );

  recordAudit({
    event: "my_day_shown",
    userId: ctx.userId,
    channel: ctx.channel,
    payload: { date: today, count: workPackages.length },
  });

  return [{ text: myDayText(workPackages, dateLabel(config.APP_TIMEZONE)) }];
}

async function runYes(ctx: MessageContext): Promise<BotReply[]> {
  const open = getOpenProposal(ctx.userId);
  const hasPending = open?.status === "pending";

  recordAudit({
    event: "command",
    userId: ctx.userId,
    channel: ctx.channel,
    payload: { command: "yes", hasPending },
  });

  if (!open || !hasPending) {
    return [{ text: nothingToConfirmText }];
  }

  return executeProposal(ctx, open);
}

function runNo(ctx: MessageContext): BotReply[] {
  const cancelled = cancelOpenProposals(ctx.userId);

  recordAudit({
    event: "command",
    userId: ctx.userId,
    channel: ctx.channel,
    payload: { command: "no", cancelled },
  });

  return [{ text: cancelled > 0 ? cancelledText : nothingToCancelText }];
}

async function runUndo(ctx: MessageContext): Promise<BotReply[]> {
  recordAudit({
    event: "command",
    userId: ctx.userId,
    channel: ctx.channel,
    payload: { command: "undo" },
  });
  return undoLast(ctx);
}

function sortForMyDay(workPackages: OpWorkPackage[]): OpWorkPackage[] {
  return [...workPackages].sort(
    (a, b) =>
      (a.projectName ?? "").localeCompare(b.projectName ?? "") ||
      (a.startDate ?? "").localeCompare(b.startDate ?? "") ||
      a.id - b.id,
  );
}
