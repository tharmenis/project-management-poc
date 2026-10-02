import { getConfig, type Config } from "@/lib/config";
import { shiftIsoDate, todayInZone, weekdayLabel } from "@/lib/dates";
import type { OpenProjectClient } from "@/lib/openproject/client";
import { OpenProjectError } from "@/lib/openproject/errors";
import { listStatuses } from "@/lib/openproject/statuses";
import { listTimeEntryActivities, type OpActivity } from "@/lib/openproject/timeEntries";
import { listCandidateWorkPackages } from "@/lib/openproject/workPackages";
import type { PromptContext } from "@/lib/llm/prompt";
import { getRecentWorkPackage } from "./proposals";
import { applyFocus, rankCandidates, resolveFocus, type Focus } from "./relevance";

const MAX_CANDIDATES = 30;
const MAX_ACTIVITY_PROJECTS = 5;

export interface BuildContextOptions {
  config?: Config;
  now?: Date;
  /** Enables remembering the work package from the previous message. */
  userId?: string;
  /** The user's message, used to rank and narrow the candidates. */
  message?: string;
}

export async function buildContext(
  client: OpenProjectClient,
  options: BuildContextOptions = {},
): Promise<PromptContext> {
  const config = options.config ?? getConfig();
  const now = options.now ?? new Date();
  const today = todayInZone(config.APP_TIMEZONE, now);
  const from = shiftIsoDate(today, -config.CANDIDATE_DAYS_BACK);
  const to = shiftIsoDate(today, config.CANDIDATE_DAYS_AHEAD);

  const workPackages = await listCandidateWorkPackages(client, {
    from,
    to,
    projectIds: config.OPENPROJECT_PROJECT_IDS,
    pageSize: 50,
  });

  const all = workPackages.slice(0, MAX_CANDIDATES).map((workPackage) => ({
    id: workPackage.id,
    subject: workPackage.subject,
    projectId: workPackage.projectId,
    projectName: workPackage.projectName,
    typeName: workPackage.typeName,
    statusName: workPackage.statusName,
    startDate: workPackage.startDate,
    dueDate: workPackage.dueDate,
  }));

  const memory = options.userId
    ? getRecentWorkPackage(options.userId, config.CONTEXT_MEMORY_MINUTES, now)
    : undefined;

  const focus = options.message ? resolveFocus(options.message, all, memory) : undefined;
  const candidates = applyFocus(rankCandidates(all, options.message), focus);

  const projectIds = [
    ...new Set(
      candidates
        .map((candidate) => candidate.projectId)
        .filter((id): id is number => id !== undefined),
    ),
  ].slice(0, MAX_ACTIVITY_PROJECTS);

  const [activityGroups, statuses] = await Promise.all([
    loadActivities(client, projectIds, candidates),
    listStatuses(client),
  ]);

  return {
    today,
    weekday: weekdayLabel(config.APP_TIMEZONE, now),
    candidates,
    activities: activityGroups,
    statusNames: statuses.map((status) => status.name),
    memory: memory
      ? { id: memory.id, subject: memory.subject, projectName: memory.projectName }
      : undefined,
    focus: describeFocus(focus, candidates),
  };
}

function describeFocus(
  focus: Focus | undefined,
  candidates: PromptContext["candidates"],
): PromptContext["focus"] {
  if (!focus) return undefined;

  if (focus.workPackageId !== undefined) {
    const candidate = candidates.find((entry) => entry.id === focus.workPackageId);
    return candidate ? { workPackageId: candidate.id, projectName: candidate.projectName } : undefined;
  }

  if (focus.projectId !== undefined) {
    return { projectName: candidates[0]?.projectName };
  }

  return undefined;
}

async function loadActivities(
  client: OpenProjectClient,
  projectIds: number[],
  candidates: PromptContext["candidates"],
): Promise<PromptContext["activities"]> {
  // Activities are per project. With no candidates, ask for the default set.
  const groups = await Promise.all(
    (projectIds.length > 0 ? projectIds : [undefined]).map(async (projectId) => ({
      projectId,
      activities: await activitiesFor(client, projectId),
    })),
  );

  const byKey = new Map<string, PromptContext["activities"][number]>();
  for (const group of groups) {
    const projectName = candidates.find(
      (candidate) => candidate.projectId === group.projectId,
    )?.projectName;

    for (const activity of group.activities) {
      const key = `${group.projectId ?? "none"}:${activity.id}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          id: activity.id,
          name: activity.name,
          projectId: group.projectId,
          projectName,
        });
      }
    }
  }

  return [...byKey.values()];
}

/**
 * Activities are per project and a user may not be able to read every project
 * they have work packages in, so a missing/invisible project is skipped rather
 * than failing the whole message.
 */
async function activitiesFor(
  client: OpenProjectClient,
  projectId: number | undefined,
): Promise<OpActivity[]> {
  try {
    return await listTimeEntryActivities(client, projectId);
  } catch (error) {
    if (
      error instanceof OpenProjectError &&
      (error.kind === "forbidden" || error.kind === "not_found")
    ) {
      return [];
    }
    throw error;
  }
}
