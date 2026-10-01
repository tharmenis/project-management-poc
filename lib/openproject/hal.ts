export interface HalLink {
  href: string;
  title?: string;
  method?: string;
}

export type HalLinks = Record<string, HalLink | HalLink[] | undefined>;

export interface HalResource {
  _links?: HalLinks;
  _embedded?: Record<string, unknown>;
  [key: string]: unknown;
}

export function linkHref(resource: HalResource, rel: string): string | undefined {
  const link = resource._links?.[rel];
  if (!link) return undefined;
  if (Array.isArray(link)) return link[0]?.href;
  return link.href;
}

export function linkTitle(resource: HalResource, rel: string): string | undefined {
  const link = resource._links?.[rel];
  const single = Array.isArray(link) ? link[0] : link;
  return single?.title;
}

export function embeddedElements(resource: HalResource, rel = "elements"): HalResource[] {
  const embedded = resource._embedded?.[rel];
  if (Array.isArray(embedded)) return embedded as HalResource[];
  return [];
}
