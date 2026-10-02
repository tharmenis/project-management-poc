import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { proposals, type Proposal as ProposalRow } from "@/lib/db/schema";
import type { OpWorkPackage } from "@/lib/openproject/workPackages";
import type { ProposalOutput } from "@/lib/llm/schema";
import type { RecentWorkPackage } from "./relevance";
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

/**
 * The work package from the user's most recent proposal, whatever its status: a
 * cancelled or executed proposal is still useful context for the next message.
 */
export function getRecentWorkPackage(
  userId: string,
  withinMinutes: number,
  now: Date = new Date(),
): RecentWorkPackage | undefined {
  const cutoff = new Date(now.getTime() - withinMinutes * 60_000).toISOString();

  const rows = getDb()
    .select()
    .from(proposals)
    .where(eq(proposals.userId, userId))
    .orderBy(desc(proposals.createdAt))
    .limit(10)
    .all();

  for (const row of rows) {
    if (row.createdAt < cutoff) break;

    const workPackageId = readWorkPackageId(row);
    if (workPackageId === undefined) continue;

    const candidate = readCandidates(row).find((entry) => entry.id === workPackageId);
    return {
      id: workPackageId,
      subject: candidate?.subject ?? `#${workPackageId}`,
      projectId: candidate?.projectId,
      projectName: candidate?.projectName,
    };
  }

  return undefined;
}

function readWorkPackageId(row: ProposalRow): number | undefined {
  const proposal = row.proposalJson as { workPackageId?: unknown } | null;
  const value = proposal?.workPackageId;
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

export function readProposal<T = ProposalOutput>(row: ProposalRow): T {
  return row.proposalJson as T;
}
