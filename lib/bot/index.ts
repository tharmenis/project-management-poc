import { recordAudit } from "@/lib/audit";
import { botMessageForError, OpenProjectError } from "@/lib/openproject/errors";
import { runCommand } from "./commands";
import { claimMessage } from "./dedupe";
import { runFreeText, selectOption } from "./proposalFlow";
import { matchCommand, parseSelection } from "./router";
import type { BotReply, MessageContext } from "./types";

/**
 * The single entry point for every channel. Front ends resolve the user and
 * render the replies; all bot behaviour lives behind this function.
 */
export async function handleMessage(ctx: MessageContext, text: string): Promise<BotReply[]> {
  const receivedAt = new Date().toISOString();
  const isNew = claimMessage(ctx.clientMessageId, ctx.userId, receivedAt);

  recordAudit({
    event: "message_received",
    userId: ctx.userId,
    channel: ctx.channel,
    messageText: text,
    payload: isNew ? null : { deduplicated: true },
  });

  if (!isNew) return [];

  try {
    return await routeMessage(ctx, text);
  } catch (error) {
    recordAudit({
      event: "error",
      userId: ctx.userId,
      channel: ctx.channel,
      error: error instanceof Error ? error.message : String(error),
    });

    const replyText =
      error instanceof OpenProjectError
        ? botMessageForError(error)
        : "Sorry, something went wrong handling that. Nothing was changed.";
    return [{ text: replyText }];
  }
}

/**
 * Deterministic commands and numeric clarifications are matched before any LLM
 * call; only free text reaches the proposal flow.
 */
async function routeMessage(ctx: MessageContext, text: string): Promise<BotReply[]> {
  const command = matchCommand(text);
  if (command) return runCommand(ctx, command);

  const selection = parseSelection(text);
  if (selection !== undefined) {
    const replies = await selectOption(ctx, selection);
    if (replies) return replies;
  }

  return runFreeText(ctx, text);
}
