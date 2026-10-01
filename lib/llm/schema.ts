import { z } from "zod";

/**
 * Nullable fields also carry a default of null: models routinely omit keys that
 * should be empty, and a missing field must mean "not set" rather than a parse
 * failure. `kind` stays required because it decides how the bot responds.
 */
export const proposalSchema = z.object({
  kind: z.enum(["update", "clarify", "unrelated"]),
  workPackageId: z.number().int().nullable().default(null),
  timeEntry: z
    .object({
      hours: z.number().positive().max(24),
      activityId: z.number().int().nullable().default(null),
      spentOn: z.string(),
    })
    .nullable()
    .default(null),
  note: z.string().max(4000).nullable().default(null),
  statusName: z.string().nullable().default(null),
  clarification: z
    .object({
      question: z.string(),
      // "Up to three" is a preference, not a hard contract: a model that offers
      // four options should still produce a usable clarification.
      optionWorkPackageIds: z.array(z.number().int()).transform((ids) => ids.slice(0, 3)),
    })
    .nullable()
    .default(null),
});

export type ProposalOutput = z.infer<typeof proposalSchema>;
