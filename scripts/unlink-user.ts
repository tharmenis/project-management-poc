import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

import { unlinkUser } from "../lib/users";
import { fail, parseArgs } from "./args";

function main() {
  const { flags, positionals } = parseArgs(process.argv.slice(2));
  const ref = flags.user ?? positionals[0];

  if (!ref) {
    fail("Usage: pnpm unlink-user <id | display name | OpenProject user id>");
  }

  const removed = unlinkUser(ref);
  if (!removed) {
    fail(`No linked user found for "${ref}".`);
  }

  console.log(`Unlinked ${ref}.`);
}

main();
