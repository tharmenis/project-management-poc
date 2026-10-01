export interface OpFilterValue {
  operator: string;
  values: string[];
}

export type OpFilter = Record<string, OpFilterValue>;

export function encodeFilters(filters: OpFilter[]): string {
  return JSON.stringify(filters);
}

export function filterAssigneeMe(): OpFilter {
  return { assignee: { operator: "=", values: ["me"] } };
}

export function filterOpenStatus(): OpFilter {
  return { status: { operator: "o", values: [] } };
}

/**
 * "Dates overlap a range" filter. The exact filter name and operator depend on
 * the installed OpenProject version (see the handover's live-verification list);
 * both are parameters so they can be corrected without touching call sites.
 */
export function filterDatesOverlap(from: string, to: string, operator = "<>d"): OpFilter {
  return { datesInterval: { operator, values: [from, to] } };
}

export function filterProjectIds(projectIds: number[]): OpFilter {
  return { project: { operator: "=", values: projectIds.map(String) } };
}
