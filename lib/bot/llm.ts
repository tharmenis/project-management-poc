import { generateObject } from "ai";
import { getModel, type ModelOverride } from "@/lib/llm/provider";
import { buildSystemPrompt, buildUserPrompt, type PromptContext } from "@/lib/llm/prompt";
import { proposalSchema, type ProposalOutput } from "@/lib/llm/schema";

/**
 * Calls the LLM and returns a structured proposal. DeepSeek's JSON mode can
 * occasionally return empty content, so a single retry is attempted before
 * giving up (the caller then replies with a graceful fallback).
 */
export async function propose(
  context: PromptContext,
  text: string,
  options: { hint?: string; override?: ModelOverride } = {},
): Promise<ProposalOutput> {
  const model = getModel(options.override);
  const system = buildSystemPrompt();
  const prompt = buildUserPrompt(context, text, options.hint);

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { object } = await generateObject({
        model,
        schema: proposalSchema,
        schemaName: "UpdateProposal",
        schemaDescription: "A proposed update to one OpenProject work package.",
        system,
        prompt,
        temperature: 0,
        maxRetries: 0,
        providerOptions: { deepseek: { thinking: { type: "disabled" } } },
      });
      return object;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}
