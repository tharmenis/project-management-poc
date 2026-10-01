import { recordAudit } from "@/lib/audit";
import { errorResponse, isSameOrigin } from "@/lib/api";
import { getConfig } from "@/lib/config";
import { OpenProjectError } from "@/lib/openproject/errors";
import { linkUser } from "@/lib/users";
import { startSession } from "@/lib/web-session";

function redirectTo(path: string): Response {
  return Response.redirect(new URL(path, getConfig().APP_BASE_URL), 303);
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return errorResponse("Bad origin", 403);
  }

  const form = await request.formData();
  const token = String(form.get("token") ?? "").trim();
  if (!token) {
    return redirectTo("/link?error=missing");
  }

  try {
    const user = await linkUser({ token });
    recordAudit({
      event: "user_linked",
      userId: user.id,
      channel: "web",
      payload: { opUserId: user.opUserId },
    });
    await startSession(user.id);
    return redirectTo("/");
  } catch (error) {
    const invalid = error instanceof OpenProjectError && error.kind === "unauthorized";
    return redirectTo(`/link?error=${invalid ? "invalid" : "failed"}`);
  }
}
