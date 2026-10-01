import { errorResponse, isSameOrigin } from "@/lib/api";
import { getConfig } from "@/lib/config";
import { endSession } from "@/lib/web-session";

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return errorResponse("Bad origin", 403);
  }

  await endSession();
  return Response.redirect(new URL("/link", getConfig().APP_BASE_URL), 303);
}
