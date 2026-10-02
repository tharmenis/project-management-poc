import { recordAudit } from "@/lib/audit";
import { getConfig } from "@/lib/config";
import { isoDateLabel, shiftIsoDate } from "@/lib/dates";
import type { ProposalOutput } from "@/lib/llm/schema";
import type { PromptContext } from "@/lib/llm/prompt";
import { clientForUser, findUser } from "@/lib/users";
import { buildContext } from "./context";
import { propose } from "./llm";
import {
  clarificationActions,
  clarificationText,
  confirmationActions,
  confirmationText,
  linkRequiredText,
  nothingToChooseText,
  selectionInvalidText,
  unrelatedText,
  unparsedText,
} from "./messages";
import { cancelOpenProposals, createProposal, getOpenProposal, readProposal } from "./proposals";
import type { BotReply, MessageContext } from "./types";
import { validateProposal, type ValidatedProposal } from "./validate";

export async function runFreeText(
  ctx: MessageContext,
  text: string,
  hint?: string,
): Promise<BotReply[]> {
  const user = findUser(ctx.userId);
  if (!user) return [{ text: linkRequiredText }];

  const config = getConfig();
  const client = clientForUser(user);

  // If we asked a clarifying question last turn, tell the model the user is
  // answering it.
  const open = getOpenProposal(ctx.userId);
  const pendingQuestion =
    open?.status === "clarifying"
      ? readProposal<ProposalOutput>(open).clarification?.question
      : undefined;

  cancelOpenProposals(ctx.userId);

  const answerHint = pendingQuestion
    ? `You previously asked the user: "${pendingQuestion}". Treat their message as the answer to that question.`
    : undefined;

  const context = await buildContext(client, {
    config,
    userId: ctx.userId,
    // The hint pins the focus when the user picked an option by number.
    message: [text, hint, answerHint].filter(Boolean).join("\n"),
  });

  let output: ProposalOutput;
  try {
    output = await propose(context, text, {
      hint: [hint, answerHint].filter(Boolean).join("\n") || undefined,
    });
  } catch (error) {
    recordAudit({
      event: "error",
      userId: ctx.userId,
      channel: ctx.channel,
      error: error instanceof Error ? error.message : String(error),
    });
    return [{ text: unparsedText }];
  }

  if (output.kind === "unrelated") {
    recordAudit({
      event: "proposal_created",
      userId: ctx.userId,
      channel: ctx.channel,
      payload: { kind: "unrelated" },
    });
    return [{ text: unrelatedText }];
  }

  if (output.kind === "clarify") {
    const optionIds = output.clarification?.optionWorkPackageIds ?? [];
    const options = optionIds
      .map((id) => context.candidates.find((candidate) => candidate.id === id))
      .filter((candidate): candidate is PromptContext["candidates"][number] => candidate !== undefined);

    if (options.length === 0) {
      return [{ text: unparsedText }];
    }

    createProposal({
      userId: ctx.userId,
      channel: ctx.channel,
      originalMessage: text,
      candidates: context.candidates,
      proposal: output,
      status: "clarifying",
      ttlMinutes: config.PROPOSAL_TTL_MINUTES,
    });

    recordAudit({
      event: "clarification_asked",
      userId: ctx.userId,
      channel: ctx.channel,
      payload: {
        question: output.clarification?.question,
        optionWorkPackageIds: optionIds,
      },
    });

    const question = output.clarification?.question ?? "Which work package did you mean?";
    return [
      {
        text: clarificationText(question, options),
        actions: clarificationActions(options),
      },
    ];
  }

  const validation = await validateProposal({ client, context, config, output });
  if (!validation.ok) {
    // Keep the turn open with the question we asked, so the answer can be read
    // as an answer rather than as a new message, and the work package the model
    // understood is remembered.
    createProposal({
      userId: ctx.userId,
      channel: ctx.channel,
      originalMessage: text,
      candidates: context.candidates,
      proposal: {
        ...output,
        clarification: { question: validation.message, optionWorkPackageIds: [] },
      },
      status: "clarifying",
      ttlMinutes: config.PROPOSAL_TTL_MINUTES,
    });

    recordAudit({
      event: "clarification_asked",
      userId: ctx.userId,
      channel: ctx.channel,
      payload: { reason: "validation", workPackageId: output.workPackageId },
      error: validation.message,
    });
    return [{ text: validation.message }];
  }

  createProposal({
    userId: ctx.userId,
    channel: ctx.channel,
    originalMessage: text,
    candidates: context.candidates,
    proposal: validation.proposal,
    status: "pending",
    ttlMinutes: config.PROPOSAL_TTL_MINUTES,
  });

  recordAudit({
    event: "proposal_created",
    userId: ctx.userId,
    channel: ctx.channel,
    payload: { workPackageId: validation.proposal.workPackageId },
  });

  return confirmationReplies(context, validation.proposal, config.APP_TIMEZONE);
}

export async function selectOption(
  ctx: MessageContext,
  index: number,
): Promise<BotReply[] | undefined> {
  const open = getOpenProposal(ctx.userId);
  if (!open || open.status !== "clarifying") {
    return [{ text: nothingToChooseText }];
  }

  const plan = readProposal<ProposalOutput>(open);
  const optionIds = plan.clarification?.optionWorkPackageIds ?? [];

  // A clarification can also be a follow-up question (which activity? which
  // date?). A number is not an answer to those, so let the message fall through
  // to the proposal flow instead of claiming it was a bad choice.
  if (optionIds.length === 0) return undefined;

  const chosen = optionIds[index - 1];
  if (chosen === undefined) {
    return [{ text: selectionInvalidText(optionIds.length) }];
  }

  recordAudit({
    event: "command",
    userId: ctx.userId,
    channel: ctx.channel,
    payload: { command: "selection", workPackageId: chosen },
  });

  return runFreeText(
    ctx,
    open.originalMessage,
    `The user chose work package #${chosen}. Use it as the target.`,
  );
}

function confirmationReplies(
  context: PromptContext,
  proposal: ValidatedProposal,
  timeZone: string,
): BotReply[] {
  const workPackage = context.candidates.find((candidate) => candidate.id === proposal.workPackageId);
  if (!workPackage) return [{ text: unparsedText }];

  const timeEntry = proposal.timeEntry;

  return [
    {
      text: confirmationText({
        workPackage,
        timeEntry: timeEntry
          ? {
              hours: timeEntry.hours,
              activityName: timeEntry.activityName,
              spentOnLabel: spentOnLabel(timeEntry.spentOn, context.today, timeZone),
            }
          : null,
        note: proposal.note,
        statusTransition: proposal.status
          ? { from: workPackage.statusName ?? null, to: proposal.status.name }
          : null,
      }),
      actions: confirmationActions(),
    },
  ];
}

function spentOnLabel(spentOn: string, today: string, timeZone: string): string {
  const label = isoDateLabel(spentOn, timeZone);
  if (spentOn === today) return `today (${label})`;
  if (spentOn === shiftIsoDate(today, -1)) return `yesterday (${label})`;
  return label;
}
