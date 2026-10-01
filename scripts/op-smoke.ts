import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

import { getConfig } from "../lib/config";
import { shiftIsoDate, todayInZone } from "../lib/dates";
import { listTimeEntryActivities } from "../lib/openproject/timeEntries";
import { listCandidateWorkPackages, type OpWorkPackage } from "../lib/openproject/workPackages";
import { clientForUser, findUser, listUsers } from "../lib/users";
import { fail, parseArgs } from "./args";

function resolveUser(ref: string | undefined) {
  if (ref) return findUser(ref);

  const all = listUsers();
  if (all.length === 1) return findUser(all[0].id);
  return undefined;
}

async function main() {
  const { flags, positionals } = parseArgs(process.argv.slice(2));
  const ref = flags.user ?? positionals[0];

  const user = resolveUser(ref);
  if (!user) {
    fail(
      ref
        ? `No linked user found for "${ref}".`
        : "Several or no users are linked; pass --user <id | display name>.",
    );
  }

  const config = getConfig();
  const today = todayInZone(config.APP_TIMEZONE);
  const from = shiftIsoDate(today, -config.CANDIDATE_DAYS_BACK);
  const to = shiftIsoDate(today, config.CANDIDATE_DAYS_AHEAD);

  const client = clientForUser(user);
  const workPackages = await listCandidateWorkPackages(client, {
    from,
    to,
    projectIds: config.OPENPROJECT_PROJECT_IDS,
  });

  console.log(
    `User: ${user.displayName} (OpenProject ${user.opUserId}) — ${workPackages.length} open work package(s) in ${from}..${to}`,
  );
  for (const workPackage of workPackages) {
    console.log(`  ${formatWorkPackage(workPackage)}`);
  }

  const projectId = workPackages[0]?.projectId;
  const activities = await listTimeEntryActivities(client, projectId);

  console.log(
    projectId
      ? `Activities for project ${projectId}:`
      : "Activities (no work package found, querying without a project):",
  );
  if (activities.length === 0) {
    console.log("  (none returned)");
  }
  for (const activity of activities) {
    console.log(`  ${activity.id}  ${activity.name}`);
  }
}

function formatWorkPackage(workPackage: OpWorkPackage): string {
  const parts = [`#${workPackage.id}`, `[${workPackage.statusName ?? "?"}]`, workPackage.subject];
  if (workPackage.projectName) parts.push(`(${workPackage.projectName})`);
  if (workPackage.startDate || workPackage.dueDate) {
    parts.push(`${workPackage.startDate ?? "…"}..${workPackage.dueDate ?? "…"}`);
  }
  return parts.join("  ");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  fail(`OpenProject smoke test failed: ${message}`);
});
