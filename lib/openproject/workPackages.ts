import type { OpenProjectClient } from "./client";
import {
  encodeFilters,
  filterAssigneeMe,
  filterDatesOverlap,
  filterOpenStatus,
  filterProjectIds,
  type OpFilter,
} from "./filters";
import { embeddedElements, linkHref, linkTitle, type HalResource } from "./hal";

export interface OpCurrentUser {
  id: number;
  name: string;
  login?: string;
}

export async function getCurrentUser(client: OpenProjectClient): Promise<OpCurrentUser> {
  const me = await client.request<HalResource & { id: number; name: string; login?: string }>(
    "GET",
    "/users/me",
  );
  return { id: Number(me.id), name: String(me.name), login: me.login };
}

export interface OpWorkPackage {
  id: number;
  subject: string;
  projectId?: number;
  projectName?: string;
  typeName?: string;
  statusName?: string;
  startDate: string | null;
  dueDate: string | null;
  lockVersion?: number;
  href?: string;
}

export function toWorkPackage(resource: HalResource): OpWorkPackage {
  const projectHref = linkHref(resource, "project");
  const projectId = projectHref ? Number(projectHref.split("/").pop()) : undefined;

  return {
    id: Number(resource.id),
    subject: String(resource.subject ?? ""),
    projectId: Number.isInteger(projectId) ? projectId : undefined,
    projectName: linkTitle(resource, "project"),
    typeName: linkTitle(resource, "type"),
    statusName: linkTitle(resource, "status"),
    startDate: (resource.startDate as string | null | undefined) ?? null,
    dueDate: (resource.dueDate as string | null | undefined) ?? null,
    lockVersion: resource.lockVersion as number | undefined,
    href: linkHref(resource, "self"),
  };
}

export interface ListWorkPackagesOptions {
  filters: OpFilter[];
  pageSize?: number;
  sortBy?: [string, "asc" | "desc"][];
}

export async function listWorkPackages(
  client: OpenProjectClient,
  options: ListWorkPackagesOptions,
): Promise<OpWorkPackage[]> {
  const collection = await client.request<HalResource>("GET", "/work_packages", {
    query: {
      filters: encodeFilters(options.filters),
      pageSize: options.pageSize ?? 50,
      sortBy: options.sortBy ? JSON.stringify(options.sortBy) : undefined,
    },
  });

  return embeddedElements(collection).map(toWorkPackage);
}

export interface CandidateWindow {
  from: string;
  to: string;
  projectIds?: number[];
  pageSize?: number;
}

export function candidateFilters(window: CandidateWindow): OpFilter[] {
  const filters = [
    filterAssigneeMe(),
    filterOpenStatus(),
    filterDatesOverlap(window.from, window.to),
  ];
  if (window.projectIds && window.projectIds.length > 0) {
    filters.push(filterProjectIds(window.projectIds));
  }
  return filters;
}

export async function listCandidateWorkPackages(
  client: OpenProjectClient,
  window: CandidateWindow,
): Promise<OpWorkPackage[]> {
  return listWorkPackages(client, {
    filters: candidateFilters(window),
    pageSize: window.pageSize ?? 50,
  });
}

export async function getWorkPackage(
  client: OpenProjectClient,
  id: number,
): Promise<OpWorkPackage> {
  const resource = await client.request<HalResource>("GET", `/work_packages/${id}`);
  return toWorkPackage(resource);
}
