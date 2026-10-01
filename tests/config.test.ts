import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/config";

const baseEnv = {
  TOKEN_ENCRYPTION_KEY: "wsUlihOYYailCv+Ndhszqn9QTSEnsHDvmy+MXz6MFEo=",
  OPENPROJECT_BASE_URL: "http://localhost:8080",
};

describe("config", () => {
  it("applies defaults for optional values", () => {
    const config = parseEnv(baseEnv);

    expect(config.APP_TIMEZONE).toBe("Europe/Athens");
    expect(config.DATABASE_PATH).toBe("./data/bot.db");
    expect(config.LLM_PROVIDER).toBe("deepseek");
    expect(config.LLM_MODEL).toBe("deepseek-v4-flash");
    expect(config.PROPOSAL_TTL_MINUTES).toBe(10);
    expect(config.UNDO_WINDOW_MINUTES).toBe(30);
    expect(config.OPENPROJECT_PROJECT_IDS).toEqual([]);
  });

  it("parses a project id list", () => {
    const config = parseEnv({
      ...baseEnv,
      OPENPROJECT_PROJECT_IDS: "12, 15",
    });

    expect(config.OPENPROJECT_PROJECT_IDS).toEqual([12, 15]);
  });

  it("rejects a key that is not 32 bytes", () => {
    expect(() => parseEnv({ ...baseEnv, TOKEN_ENCRYPTION_KEY: "dG9vLXNob3J0" })).toThrow();
  });

  it("requires an OpenProject base URL", () => {
    expect(() => parseEnv({ TOKEN_ENCRYPTION_KEY: baseEnv.TOKEN_ENCRYPTION_KEY })).toThrow();
  });
});
