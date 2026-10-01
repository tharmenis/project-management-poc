import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

import { linkUser } from "../lib/users";
import { fail, parseArgs } from "./args";

function usage(): never {
  fail("Usage: pnpm link-user --token <token> [--name <display name>] [--base-url <url>]");
}

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));

  const token = flags.token;
  if (!token) usage();

  const user = await linkUser({
    token,
    displayName: flags.name,
    baseUrl: flags["base-url"],
  });

  console.log(
    `Linked ${user.displayName} (OpenProject user ${user.opUserId}, internal id ${user.id}).`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  fail(`Failed to link user: ${message}`);
});
