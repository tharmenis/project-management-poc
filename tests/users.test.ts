import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { HttpResponse, http } from "msw";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getConfig } from "@/lib/config";
import { decryptToken } from "@/lib/crypto";
import { getDb } from "@/lib/db/client";
import { userLinks } from "@/lib/db/schema";
import { OpenProjectError } from "@/lib/openproject/errors";
import { findUser, linkUser, listUsers, unlinkUser } from "@/lib/users";
import { server } from "./msw/server";

const DB_PATH = join(tmpdir(), `poc-bot-test-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = DB_PATH;

const BASE = "http://localhost:8080";
const usersMe = (id: number, name: string, login: string) =>
  http.get(`${BASE}/api/v3/users/me`, () => HttpResponse.json({ id, name, login }));

beforeAll(() => {
  migrate(getDb(), { migrationsFolder: "./drizzle" });
});

afterAll(() => {
  rmSync(DB_PATH, { force: true });
  rmSync(`${DB_PATH}-wal`, { force: true });
  rmSync(`${DB_PATH}-shm`, { force: true });
});

describe("user linking", () => {
  it("stores the token encrypted, never in plain text", async () => {
    server.use(usersMe(7, "Pilot User", "pilot"));

    const user = await linkUser({ token: "super-secret-token" });
    expect(user).toMatchObject({ opUserId: "7", opUserName: "Pilot User", active: true });

    const row = getDb().select().from(userLinks).where(eq(userLinks.opUserId, "7")).get();
    if (!row) throw new Error("expected the user to be stored");
    expect(row.tokenCiphertext).not.toContain("super-secret-token");

    const decrypted = decryptToken(
      {
        ciphertext: row.tokenCiphertext,
        iv: row.tokenIv,
        tag: row.tokenTag,
      },
      getConfig().TOKEN_ENCRYPTION_KEY,
    );
    expect(decrypted).toBe("super-secret-token");
  });

  it("replaces the token on re-link instead of creating a second row", async () => {
    server.use(usersMe(7, "Pilot User", "pilot"));

    await linkUser({ token: "rotated-token" });

    const rows = getDb().select().from(userLinks).where(eq(userLinks.opUserId, "7")).all();
    expect(rows).toHaveLength(1);

    const decrypted = decryptToken(
      { ciphertext: rows[0].tokenCiphertext, iv: rows[0].tokenIv, tag: rows[0].tokenTag },
      getConfig().TOKEN_ENCRYPTION_KEY,
    );
    expect(decrypted).toBe("rotated-token");
  });

  it("finds a user by reference and unlinks them", async () => {
    server.use(usersMe(9, "Second User", "second"));
    await linkUser({ token: "another-token", displayName: "Second" });

    expect(findUser("Second")?.opUserId).toBe("9");
    expect(findUser("9")?.opUserName).toBe("Second User");
    expect(listUsers().length).toBeGreaterThanOrEqual(2);

    expect(unlinkUser("Second")).toBe(true);
    expect(findUser("Second")).toBeUndefined();
  });

  it("rejects an invalid token and stores nothing", async () => {
    const before = listUsers().length;
    server.use(
      http.get(`${BASE}/api/v3/users/me`, () => new HttpResponse(null, { status: 401 })),
    );

    await expect(linkUser({ token: "bad-token" })).rejects.toBeInstanceOf(OpenProjectError);
    expect(listUsers()).toHaveLength(before);
  });
});
