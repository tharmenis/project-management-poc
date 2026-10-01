import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { proposals, type Proposal as ProposalRow } from "@/lib/db/schema";
import type { OpWorkPackage } from "@/lib/openproject/workPackages";
import type { ProposalOutput } from "@/lib/llm/schema";
import type { Channel } from "./types";

export type { ProposalRow };

const OPEN_STATUSES = ["clarifying", "pending"] as const;

export interface CreateProposalInput {
  userId: string;
  channel: Channel;
  originalMessage: string;
  candidates: OpWorkPackage[];
  proposal: unknown;
  status: "clarifying" | "pending";
  ttlMinutes: number;
}

export function createProposal(input: CreateProposalInput): ProposalRow {
  const now = new Date();
  const row: ProposalRow = {
    id: randomUUID(),
    userId: input.userId,
    channel: input.channel,
    originalMessage: input.originalMessage,
    candidatesJson: input.candidates,
    proposalJson: input.proposal ?? null,
    status: input.status,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + input.ttlMinutes * 60_000).toISOString(),
    resolvedAt: null,
  };

  getDb().insert(proposals).values(row).run();
  return row;
}

export function cancelOpenProposals(userId: string): number {
  const result = getDb()
    .update(proposals)
    .set({ status: "cancelled", resolvedAt: new Date().toISOString() })
    .where(and(eq(proposals.userId, userId), inArray(proposals.status, [...OPEN_STATUSES])))
    .run();

  return result.changes;
}

export function getOpenProposal(userId: string, now: Date = new Date()): ProposalRow | undefined {
  const row = getDb()
    .select()
    .from(proposals)
    .where(and(eq(proposals.userId, userId), inArray(proposals.status, [...OPEN_STATUSES])))
    .orderBy(desc(proposals.createdAt))
    .get();

  if (!row) return undefined;

  if (row.expiresAt <= now.toISOString()) {
    resolveProposal(row.id, "expired", now);
    return undefined;
  }

  return row;
}

export function resolveProposal(
  id: string,
  status: "confirmed" | "cancelled" | "expired" | "failed",
  now: Date = new Date(),
): void {
  getDb()
    .update(proposals)
    .set({ status, resolvedAt: now.toISOString() })
    .where(eq(proposals.id, id))
    .run();
}

export function readCandidates(row: ProposalRow): OpWorkPackage[] {
  return (row.candidatesJson ?? []) as OpWorkPackage[];
}

export function readProposal<T = ProposalOutput>(row: ProposalRow): T {
  return row.proposalJson as T;
}
