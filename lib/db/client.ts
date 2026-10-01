import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { getConfig } from "@/lib/config";
import * as schema from "./schema";

function createDb() {
  const { DATABASE_PATH } = getConfig();
  mkdirSync(dirname(DATABASE_PATH), { recursive: true });

  const sqlite = new Database(DATABASE_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  return drizzle(sqlite, { schema });
}

type Db = ReturnType<typeof createDb>;

let instance: Db | undefined;

export function getDb(): Db {
  if (!instance) {
    instance = createDb();
  }
  return instance;
}

export { schema };
