import type { OpenProjectClient } from "./client";
import { hoursToIso8601 } from "./durations";
import { extractAllowedValues, type OpAllowedValue } from "./forms";
import type { HalResource } from "./hal";

export type OpActivity = OpAllowedValue;

export function extractActivities(form: HalResource): OpActivity[] {
  return extractAllowedValues(form, "activity");
}

export async function listTimeEntryActivities(
  client: OpenProjectClient,
  projectId?: number,
): Promise<OpActivity[]> {
  const body = projectId
    ? { _links: { project: { href: `/api/v3/projects/${projectId}` } } }
    : {};
  const form = await client.request<HalResource>("POST", "/time_entries/form", { body });
  return extractActivities(form);
}

export interface CreateTimeEntryInput {
  workPackageId: number;
  activityId: number;
  hours: number;
  spentOn: string;
  comment?: string;
}

export async function createTimeEntry(
  client: OpenProjectClient,
  input: CreateTimeEntryInput,
): Promise<{ id: number }> {
  const body: Record<string, unknown> = {
    _links: {
      workPackage: { href: `/api/v3/work_packages/${input.workPackageId}` },
      activity: { href: `/api/v3/time_entries/activities/${input.activityId}` },
    },
    hours: hoursToIso8601(input.hours),
    spentOn: input.spentOn,
  };
  if (input.comment) body.comment = { raw: input.comment };

  const created = await client.request<HalResource & { id: number }>("POST", "/time_entries", {
    body,
  });
  return { id: Number(created.id) };
}

export async function deleteTimeEntry(
  client: OpenProjectClient,
  timeEntryId: number,
): Promise<void> {
  await client.request<void>("DELETE", `/time_entries/${timeEntryId}`);
}
