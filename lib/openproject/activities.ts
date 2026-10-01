import type { OpenProjectClient } from "./client";
import type { HalResource } from "./hal";

export const RETRACTED_TEXT = "Retracted by the author via chat bot";

export async function addComment(
  client: OpenProjectClient,
  workPackageId: number,
  text: string,
  suffix?: string,
): Promise<{ activityId: number }> {
  const raw = suffix && suffix.trim().length > 0 ? `${text}\n\n${suffix}` : text;
  const created = await client.request<HalResource & { id: number }>(
    "POST",
    `/work_packages/${workPackageId}/activities`,
    { body: { comment: { raw } } },
  );
  return { activityId: Number(created.id) };
}

export async function retractComment(
  client: OpenProjectClient,
  activityId: number,
): Promise<void> {
  await client.request<HalResource>("PATCH", `/activities/${activityId}`, {
    body: { comment: { raw: RETRACTED_TEXT } },
  });
}
