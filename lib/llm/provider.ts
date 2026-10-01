import { createDeepSeek } from "@ai-sdk/deepseek";
import type { LanguageModel } from "ai";
import { getConfig } from "@/lib/config";

export interface ModelOverride {
  provider?: string;
  model?: string;
}

/**
 * Provider-agnostic model factory. DeepSeek is wired now; adding another
 * provider means one case here plus its AI SDK package.
 */
export function getModel(override: ModelOverride = {}): LanguageModel {
  const config = getConfig();
  const provider = override.provider ?? config.LLM_PROVIDER;
  const model = override.model ?? config.LLM_MODEL;

  if (provider === "deepseek") {
    if (!config.DEEPSEEK_API_KEY) {
      throw new Error("DEEPSEEK_API_KEY must be set when LLM_PROVIDER=deepseek");
    }
    const deepSeek = createDeepSeek({
      apiKey: config.DEEPSEEK_API_KEY,
      baseURL: config.DEEPSEEK_BASE_URL,
    });
    return deepSeek(model);
  }

  throw new Error(`LLM provider "${provider}" is not wired yet. Add it in lib/llm/provider.ts.`);
}
