import { getDb } from "@/lib/db/client";
import { processedMessages } from "@/lib/db/schema";

/**
 * Claims a client message id. Returns true only for the first caller; later
 * callers with the same id get false and must not process the message again.
 */
export function claimMessage(
  clientMessageId: string,
  userId: string,
  receivedAt: string,
): boolean {
  const result = getDb()
    .insert(processedMessages)
    .values({ clientMessageId, userId, receivedAt })
    .onConflictDoNothing()
    .run();

  return result.changes === 1;
}
