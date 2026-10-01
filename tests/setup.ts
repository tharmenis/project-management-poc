import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw/server";

process.env.APP_BASE_URL ??= "http://localhost:3000";
process.env.APP_TIMEZONE ??= "Europe/Athens";
process.env.DATABASE_PATH ??= "./data/test.db";
process.env.TOKEN_ENCRYPTION_KEY ??= "wsUlihOYYailCv+Ndhszqn9QTSEnsHDvmy+MXz6MFEo=";
process.env.OPENPROJECT_BASE_URL ??= "http://localhost:8080";
process.env.DEEPSEEK_API_KEY ??= "test-key";

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
