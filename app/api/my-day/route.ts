import { randomUUID } from "node:crypto";
import { errorResponse, jsonResponse } from "@/lib/api";
import { myDayReplies } from "@/lib/bot/commands";
import { currentUserId } from "@/lib/web-session";

export async function GET(): Promise<Response> {
  const userId = await currentUserId();
  if (!userId) {
    return errorResponse("Not signed in", 401);
  }

  const replies = await myDayReplies({
    userId,
    channel: "web",
    clientMessageId: randomUUID(),
  });

  return jsonResponse({ replies });
}
