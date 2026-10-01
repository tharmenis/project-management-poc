import { z } from "zod";
import { errorResponse, isSameOrigin, jsonResponse } from "@/lib/api";
import { handleMessage } from "@/lib/bot";
import { currentUserId } from "@/lib/web-session";

const bodySchema = z.object({
  clientMessageId: z.string().min(1).max(200),
  text: z.string().min(1).max(4000),
});

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return errorResponse("Bad origin", 403);
  }

  const userId = await currentUserId();
  if (!userId) {
    return errorResponse("Not signed in", 401);
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse("Invalid request", 400);
  }

  const replies = await handleMessage(
    {
      userId,
      channel: "web",
      clientMessageId: parsed.data.clientMessageId,
    },
    parsed.data.text,
  );

  return jsonResponse({ replies });
}
