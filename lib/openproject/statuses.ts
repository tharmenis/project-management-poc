import type { OpenProjectClient } from "./client";
import { extractAllowedValues, type OpAllowedValue } from "./forms";
import { embeddedElements, type HalResource } from "./hal";
import { getWorkPackage } from "./workPackages";

export interface OpStatus {
  id: number;
  name: string;
}

export async function listStatuses(client: OpenProjectClient): Promise<OpStatus[]> {
  const collection = await client.request<HalResource>("GET", "/statuses", {
    query: { pageSize: 100 },
  });

  return embeddedElements(collection)
    .map((resource) => ({ id: Number(resource.id), name: String(resource.name ?? "") }))
    .filter((status) => Number.isInteger(status.id) && status.name.length > 0);
}

export async function listAllowedStatuses(
  client: OpenProjectClient,
  workPackageId: number,
): Promise<OpAllowedValue[]> {
  const workPackage = await getWorkPackage(client, workPackageId);
  const form = await client.request<HalResource>("POST", `/work_packages/${workPackageId}/form`, {
    body: { lockVersion: workPackage.lockVersion ?? 0 },
  });
  return extractAllowedValues(form, "status");
}
