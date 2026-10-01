import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { handleMessage } from "../lib/bot";
import { createFileLogger } from "../lib/logger";
import { findUser } from "../lib/users";
import { fail, parseArgs } from "./args";

const LOG_FILE = "./data/repl.log";

const prompt = () => stdout.write("> ");

async function main() {
  const { flags, positionals } = parseArgs(process.argv.slice(2));
  const ref = flags.user ?? positionals[0];

  if (!ref) {
    fail("Usage: pnpm chat --user <id | display name | OpenProject user id>");
  }

  const user = findUser(ref);
  if (!user) {
    fail(`No linked user found for "${ref}". Link one first with "pnpm link-user --token <token>".`);
  }

  const userId = user.id;
  const displayName = user.displayName;

  const logger = createFileLogger(LOG_FILE);
  logger.info({ userId, displayName }, "repl session started");

  const rl = createInterface({ input: stdin, output: stdout, terminal: stdin.isTTY ?? false });
  console.log(`Chatting as ${displayName}. Press Ctrl+D to exit.`);

  async function processLine(line: string): Promise<void> {
    const text = line.trim();
    if (!text) {
      prompt();
      return;
    }

    const clientMessageId = randomUUID();
    const replies = await handleMessage(
      { userId, channel: "repl", clientMessageId },
      text,
    );

    for (const reply of replies) {
      console.log(`\n${reply.text}`);
      if (reply.actions && reply.actions.length > 0) {
        console.log(reply.actions.map((action) => `[${action.value}] ${action.label}`).join("  "));
      }
    }
    console.log("");

    logger.info({ clientMessageId, replyCount: replies.length }, "message handled");
    prompt();
  }

  let chain = Promise.resolve();
  prompt();

  rl.on("line", (line) => {
    chain = chain.then(() => processLine(line));
  });

  await new Promise<void>((resolve) => rl.on("close", () => resolve()));
  await chain;

  logger.info("repl session ended");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  fail(`Chat failed: ${message}`);
});
