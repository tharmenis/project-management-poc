import { config as loadEnv } from "dotenv";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "../lib/db/client";
import { getConfig } from "../lib/config";

loadEnv({ path: ".env.local" });
loadEnv();

const { DATABASE_PATH } = getConfig();

migrate(getDb(), { migrationsFolder: "./drizzle" });

console.log(`Migrations applied to ${DATABASE_PATH}`);
