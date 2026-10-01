import { getConfig } from "@/lib/config";

/** All POST routes must come from the app's own origin. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return normalize(origin) === normalize(getConfig().APP_BASE_URL);
}

function normalize(url: string): string {
  return url.replace(/\/+$/, "");
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}
