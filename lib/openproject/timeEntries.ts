import type { OpenProjectClient } from "./client";
import type { HalResource } from "./hal";

export interface OpActivity {
  id: number;
  name: string;
}

/**
 * Allowed time-entry activities come from the form endpoint's schema. The exact
 * response shape varies by OpenProject version (see the handover's live-verification
 * list), so this reads allowed values from either the embedded array or the link.
 */
export function extractActivities(form: HalResource): OpActivity[] {
  const schema = (form._embedded?.schema ?? {}) as HalResource;
  const activity = schema.activity as HalResource | undefined;
  if (!activity) return [];

  const embedded = activity._embedded?.allowedValues;
  const linked = activity._links?.allowedValues;
  const raw = Array.isArray(embedded) ? embedded : Array.isArray(linked) ? linked : [];

  return (raw as Record<string, unknown>[])
    .map(toActivity)
    .filter((activity): activity is OpActivity => activity !== undefined);
}

function toActivity(value: Record<string, unknown>): OpActivity | undefined {
  const href = typeof value.href === "string" ? value.href : undefined;
  const id = href ? Number(href.split("/").pop()) : Number(value.id);
  if (!Number.isInteger(id)) return undefined;

  const name = value.title ?? value.name;
  return { id, name: typeof name === "string" ? name : `Activity ${id}` };
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
