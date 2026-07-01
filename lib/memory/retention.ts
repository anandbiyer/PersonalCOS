import { and, or, eq, lt, isNull, inArray } from "drizzle-orm";
import { withOwner } from "@/lib/db";
import { users, conversationTurns, conversationSummaries, tasks, embeddings } from "@/lib/db/schema";

/**
 * Tiered retention sweep (FR47 §4.6.1). Runs per owner, three passes, each
 * skipping the never-expire class entirely:
 *   1. Verbatim turns — delete those past `retention_days` OR completion-pruned,
 *      plus their turn-embeddings.
 *   2. Completed one-off tasks — ARCHIVE (not delete) past
 *      `completed_archive_months`, dropping their embeddings; row + audit kept.
 *   3. Day-summaries — roll off past `summary_retention_months`, with embeddings.
 * Never touches memory_facts, decisions, people, or recurring tasks (NFR-5).
 * Deterministic; safe to run daily. RLS-scoped.
 */
function monthsAgo(now: Date, n: number): Date {
  const d = new Date(now);
  d.setMonth(d.getMonth() - n);
  return d;
}

export interface RetentionResult {
  turnsDeleted: number;
  tasksArchived: number;
  summariesRolledOff: number;
}

export async function runRetention(ownerId: string, now = new Date()): Promise<RetentionResult> {
  return withOwner(ownerId, async (tx) => {
    const [u] = await tx
      .select({
        rd: users.retentionDays,
        cam: users.completedArchiveMonths,
        srm: users.summaryRetentionMonths,
      })
      .from(users)
      .where(eq(users.id, ownerId));
    const retentionDays = u?.rd ?? 7;
    const archiveMonths = u?.cam ?? 12;
    const summaryMonths = u?.srm ?? 18;

    const turnCutoff = new Date(now.getTime() - retentionDays * 86_400_000);
    const archiveCutoff = monthsAgo(now, archiveMonths);
    const summaryCutoff = monthsAgo(now, summaryMonths).toISOString().slice(0, 10);

    // 1. Verbatim turns: past the window OR completion-pruned.
    const turnRows = await tx
      .select({ id: conversationTurns.id })
      .from(conversationTurns)
      .where(or(lt(conversationTurns.createdAt, turnCutoff), eq(conversationTurns.pruneEligible, true)));
    const turnIds = turnRows.map((r) => r.id);
    if (turnIds.length) {
      await tx
        .delete(embeddings)
        .where(and(eq(embeddings.source, "turn"), inArray(embeddings.expiresWithTurnId, turnIds)));
      await tx.delete(conversationTurns).where(inArray(conversationTurns.id, turnIds));
    }

    // 2. Completed ONE-OFF tasks (recurrence null) → archive, not delete.
    const taskRows = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.status, "completed"),
          isNull(tasks.recurrence),
          isNull(tasks.archivedAt),
          lt(tasks.completedAt, archiveCutoff),
        ),
      );
    const taskIds = taskRows.map((r) => r.id);
    if (taskIds.length) {
      await tx.update(tasks).set({ archivedAt: now }).where(inArray(tasks.id, taskIds));
      await tx
        .delete(embeddings)
        .where(and(eq(embeddings.entityType, "task"), inArray(embeddings.entityId, taskIds)));
    }

    // 3. Day-summaries → roll off.
    const sumRows = await tx
      .select({ id: conversationSummaries.id })
      .from(conversationSummaries)
      .where(lt(conversationSummaries.date, summaryCutoff));
    const sumIds = sumRows.map((r) => r.id);
    if (sumIds.length) {
      await tx
        .delete(embeddings)
        .where(and(eq(embeddings.source, "summary"), inArray(embeddings.entityId, sumIds)));
      await tx.delete(conversationSummaries).where(inArray(conversationSummaries.id, sumIds));
    }

    return { turnsDeleted: turnIds.length, tasksArchived: taskIds.length, summariesRolledOff: sumIds.length };
  });
}
