import type { HalResource } from "./hal";

export interface OpAllowedValue {
  id: number;
  name: string;
}

/**
 * Reads `allowedValues` for a property of an OpenProject form response. The
 * location (embedded array vs. link) varies by version, so both are accepted.
 */
export function extractAllowedValues(form: HalResource, property: string): OpAllowedValue[] {
  const schema = (form._embedded?.schema ?? {}) as HalResource;
  const prop = schema[property] as HalResource | undefined;
  if (!prop) return [];

  const embedded = prop._embedded?.allowedValues;
  const linked = prop._links?.allowedValues;
  const raw = Array.isArray(embedded) ? embedded : Array.isArray(linked) ? linked : [];

  return (raw as Record<string, unknown>[])
    .map(toAllowedValue)
    .filter((value): value is OpAllowedValue => value !== undefined);
}

function toAllowedValue(value: Record<string, unknown>): OpAllowedValue | undefined {
  const href = typeof value.href === "string" ? value.href : undefined;
  const id = href ? Number(href.split("/").pop()) : Number(value.id);
  if (!Number.isInteger(id)) return undefined;

  const name = value.title ?? value.name;
  return { id, name: typeof name === "string" ? name : `Value ${id}` };
}
