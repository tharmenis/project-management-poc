import type { Config } from "@/lib/config";
import type { PromptContext } from "@/lib/llm/prompt";
import type { ProposalOutput } from "@/lib/llm/schema";
import type { OpenProjectClient } from "@/lib/openproject/client";
import { listAllowedStatuses } from "@/lib/openproject/statuses";
import { listTimeEntryActivities } from "@/lib/openproject/timeEntries";
import { shiftIsoDate } from "@/lib/dates";

export interface ValidatedProposal {
  workPackageId: number;
  timeEntry: { hours: number; activityId: number; activityName: string; spentOn: string } | null;
  note: string | null;
  status: { id: number; name: string } | null;
}

export type ValidationOutcome =
  | { ok: true; proposal: ValidatedProposal }
  | { ok: false; message: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HOUR_STEP = 0.25;

function roundHours(hours: number): number {
  return Math.round(hours / HOUR_STEP) * HOUR_STEP;
}

export async function validateProposal(input: {
  client: OpenProjectClient;
  context: PromptContext;
  config: Config;
  output: ProposalOutput;
}): Promise<ValidationOutcome> {
  const { client, context, config, output } = input;

  const candidate = context.candidates.find(
    (entry) => entry.id === output.workPackageId,
  );
  if (!candidate) {
    return {
      ok: false,
      message:
        "I couldn't match that to one of your work packages. Could you name the work package or its number?",
    };
  }

  let timeEntry: ValidatedProposal["timeEntry"] = null;
  if (output.timeEntry) {
    const hours = roundHours(output.timeEntry.hours);
    if (hours < HOUR_STEP || hours > 24) {
      return { ok: false, message: "How many hours should I log? (between 0.25 and 24)" };
    }

    const spentOn = output.timeEntry.spentOn;
    if (!ISO_DATE.test(spentOn)) {
      return { ok: false, message: "Which date was that? Please give it as YYYY-MM-DD." };
    }
    if (spentOn > context.today) {
      return { ok: false, message: "That date is in the future. Which day did you work on it?" };
    }
    const oldest = shiftIsoDate(context.today, -config.MAX_DAYS_BACK_FOR_TIME);
    if (spentOn < oldest) {
      return {
        ok: false,
        message: `I can only log time up to ${config.MAX_DAYS_BACK_FOR_TIME} days back. Which recent day was it?`,
      };
    }

    // Activities are per project, so validate against the chosen work package's project.
    const activities = await listTimeEntryActivities(client, candidate.projectId);
    const requested = output.timeEntry.activityId;
    const match =
      requested === null ? undefined : activities.find((activity) => activity.id === requested);

    if (!match) {
      if (activities.length === 0) {
        return {
          ok: false,
          message: "I couldn't find any time entry activities for that project.",
        };
      }
      const options = activities.map((activity) => activity.name).join(", ");
      return { ok: false, message: `Which activity should I use? Choose one of: ${options}.` };
    }

    timeEntry = { hours, activityId: match.id, activityName: match.name, spentOn };
  }

  const note = output.note && output.note.trim().length > 0 ? output.note.trim() : null;

  let status: ValidatedProposal["status"] = null;
  if (output.statusName && output.statusName.trim().length > 0) {
    const requested = output.statusName.trim();
    const allowed = await listAllowedStatuses(client, candidate.id);
    const match = allowed.find((entry) => entry.name.toLowerCase() === requested.toLowerCase());
    if (!match) {
      const options = allowed.map((entry) => entry.name).join(", ");
      return {
        ok: false,
        message: options
          ? `"${requested}" isn't a status you can set on that work package. Choose one of: ${options}.`
          : `You can't change the status of that work package.`,
      };
    }
    status = { id: match.id, name: match.name };
  }

  if (!timeEntry && !note && !status) {
    return {
      ok: false,
      message: "What should I change? I can log time, add a note, or set a status.",
    };
  }

  return {
    ok: true,
    proposal: { workPackageId: candidate.id, timeEntry, note, status },
  };
}
