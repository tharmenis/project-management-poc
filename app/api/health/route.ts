import { jsonResponse } from "@/lib/api";

export function GET(): Response {
  return jsonResponse({ status: "ok" });
}
