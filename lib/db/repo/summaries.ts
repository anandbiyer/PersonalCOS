import { and, desc, eq } from "drizzle-orm";
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
