import { randomUUID } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { getConfig } from "@/lib/config";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { getDb } from "@/lib/db/client";
import { userLinks, type UserLink } from "@/lib/db/schema";
import { OpenProjectClient } from "@/lib/openproject/client";
import { getCurrentUser } from "@/lib/openproject/workPackages";

export interface LinkedUser {
  id: string;
  displayName: string;
  opUserId: string;
  opUserName: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

function toLinkedUser(row: UserLink): LinkedUser {
  return {
    id: row.id,
    displayName: row.displayName,
    opUserId: row.opUserId,
    opUserName: row.opUserName,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface LinkUserInput {
  token: string;
  displayName?: string;
  baseUrl?: string;
}

export async function linkUser(input: LinkUserInput): Promise<LinkedUser> {
  const config = getConfig();
  const baseUrl = input.baseUrl ?? config.OPENPROJECT_BASE_URL;

  const client = new OpenProjectClient({ baseUrl, token: input.token });
  const me = await getCurrentUser(client);

  const encrypted = encryptToken(input.token, config.TOKEN_ENCRYPTION_KEY);
  const now = new Date().toISOString();
  const db = getDb();

  const existing = db
    .select()
    .from(userLinks)
    .where(eq(userLinks.opUserId, String(me.id)))
    .get();

  const displayName = input.displayName ?? me.name;

  if (existing) {
    db.update(userLinks)
      .set({
        displayName,
        opUserName: me.name,
        tokenCiphertext: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenTag: encrypted.tag,
        active: true,
        updatedAt: now,
      })
      .where(eq(userLinks.id, existing.id))
      .run();

    return toLinkedUser({
      ...existing,
      displayName,
      opUserName: me.name,
      active: true,
      updatedAt: now,
    });
  }

  const row: UserLink = {
    id: randomUUID(),
    displayName,
    opUserId: String(me.id),
    opUserName: me.name,
    tokenCiphertext: encrypted.ciphertext,
    tokenIv: encrypted.iv,
    tokenTag: encrypted.tag,
    rcUserId: null,
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(userLinks).values(row).run();
  return toLinkedUser(row);
}

export function findUser(ref: string): UserLink | undefined {
  return getDb()
    .select()
    .from(userLinks)
    .where(
      or(
        eq(userLinks.id, ref),
        eq(userLinks.displayName, ref),
        eq(userLinks.opUserId, ref),
        eq(userLinks.opUserName, ref),
      ),
    )
    .get();
}

export function listUsers(): LinkedUser[] {
  return getDb().select().from(userLinks).all().map(toLinkedUser);
}

export function unlinkUser(ref: string): boolean {
  const user = findUser(ref);
  if (!user) return false;
  getDb().delete(userLinks).where(eq(userLinks.id, user.id)).run();
  return true;
}

export function getUserId(ref: string): string | undefined {
  return findUser(ref)?.id;
}

export function clientForUser(user: UserLink, baseUrl?: string): OpenProjectClient {
  const config = getConfig();
  const token = decryptToken(
    { ciphertext: user.tokenCiphertext, iv: user.tokenIv, tag: user.tokenTag },
    config.TOKEN_ENCRYPTION_KEY,
  );
  return new OpenProjectClient({ baseUrl: baseUrl ?? config.OPENPROJECT_BASE_URL, token });
}
