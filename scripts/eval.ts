import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

import { readFileSync } from "node:fs";
import { buildContext } from "../lib/bot/context";
import { propose } from "../lib/bot/llm";
import { getConfig } from "../lib/config";
import { compareOutput, describeError, formatReport, parseExample, type ExampleResult } from "../lib/eval";
import { clientForUser, findUser } from "../lib/users";
import { fail, parseArgs } from "./args";

const DEFAULT_FILE = "eval/messages.jsonl";

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const file = flags.file ?? DEFAULT_FILE;
  const config = getConfig();
  const provider = flags.provider ?? config.LLM_PROVIDER;
  const model = flags.model ?? config.LLM_MODEL;

  const lines = readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    fail(`${file} has no examples.`);
  }

  const results: ExampleResult[] = [];

  for (const line of lines) {
    const example = parseExample(line);

    const user = findUser(example.userId);
    if (!user) {
      results.push({ example, results: [], error: `no linked user matches "${example.userId}"` });
      process.stdout.write("x");
      continue;
    }

    try {
      const client = clientForUser(user);
      const context = await buildContext(client, config, referenceDate(example.date));
      const output = await propose(context, example.text, { override: { provider, model } });
      results.push({ example, output, results: compareOutput(example, output) });
      process.stdout.write(".");
    } catch (error) {
      results.push({ example, results: [], error: describeError(error) });
      process.stdout.write("x");
    }
  }

  process.stdout.write("\n\n");
  console.log(formatReport({ provider, model, results }));
}

/** Anchor the reference date at midday UTC so the app's time zone resolves to that day. */
function referenceDate(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

main().catch((error: unknown) => {
  fail(`Evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
});
