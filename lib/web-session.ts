import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  createSession,
  deleteSession,
  getSessionUserId,
  sessionCookieOptions,
} from "./session";

export async function currentUserId(): Promise<string | undefined> {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE)?.value;
  return value ? getSessionUserId(value) : undefined;
}

export async function startSession(userId: string): Promise<void> {
  const session = createSession(userId);
  const store = await cookies();
  store.set(SESSION_COOKIE, session.value, sessionCookieOptions());
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE)?.value;
  if (value) deleteSession(value);
  store.delete(SESSION_COOKIE);
}
