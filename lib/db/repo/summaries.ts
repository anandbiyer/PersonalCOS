import { and, desc, eq, sql } from "drizzle-orm";
import { withOwner } from "@/lib/db";
import { conversationSummaries } from "@/lib/db/schema";

export interface SaveSummaryInput {
  date: string; // YYYY-MM-DD
  summaryText: string;
  openThreads?: unknown[];
}

/** Write a durable day-summary (T2). Permanent until the ~18 mo roll-off (FR47). */
export async function saveDaySummary(ownerId: string, input: SaveSummaryInput) {
  return withOwner(ownerId, async (tx) => {
    const [row] = await tx
      .insert(conversationSummaries)
      .values({
        ownerId,
        date: input.date,
        summaryText: input.summaryText,
        openThreadsJson: input.openThreads ?? [],
      })
      .returning();
    return row;
  });
}

export async function getDaySummary(ownerId: string, date: string) {
  return withOwner(ownerId, async (tx) => {
    const [row] = await tx
      .select()
      .from(conversationSummaries)
      .where(
        and(
          eq(conversationSummaries.ownerId, ownerId),
          eq(conversationSummaries.date, date),
        ),
      );
    return row ?? null;
  });
}

export async function listDaySummaries(ownerId: string, limit = 60) {
  return withOwner(ownerId, async (tx) => {
    return tx
      .select()
      .from(conversationSummaries)
      .orderBy(desc(conversationSummaries.date))
      .limit(limit);
  });
}

/** History-by-day (FR48): each day that has verbatim turns ("full") or only a
 *  summary ("summary"), newest first. */
export async function listDayHistory(
  ownerId: string,
  limit = 30,
): Promise<{ date: string; full: boolean }[]> {
  return withOwner(ownerId, async (tx) => {
    const rows = await tx.execute<{ date: string; full: boolean }>(
      sql`SELECT d::text AS date,
                 EXISTS (SELECT 1 FROM conversation_turns t WHERE date(t.created_at) = d) AS full
          FROM (
            SELECT DISTINCT date(created_at) AS d FROM conversation_turns
            UNION
            SELECT date AS d FROM conversation_summaries
          ) days
          ORDER BY d DESC
          LIMIT ${limit}`,
    );
    return (rows as unknown as { date: string; full: boolean }[]).map((r) => ({
      date: r.date,
      full: r.full,
    }));
  });
}
