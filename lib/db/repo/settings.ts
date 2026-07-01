import { eq } from "drizzle-orm";
import { withOwner } from "@/lib/db";
import { users } from "@/lib/db/schema";

export interface RetentionSettings {
  retentionDays: number;
  completedArchiveMonths: number;
  summaryRetentionMonths: number;
}

export async function getRetention(ownerId: string): Promise<RetentionSettings> {
  return withOwner(ownerId, async (tx) => {
    const [u] = await tx
      .select({
        retentionDays: users.retentionDays,
        completedArchiveMonths: users.completedArchiveMonths,
        summaryRetentionMonths: users.summaryRetentionMonths,
      })
      .from(users)
      .where(eq(users.id, ownerId));
    return u ?? { retentionDays: 7, completedArchiveMonths: 12, summaryRetentionMonths: 18 };
  });
}

/** Update retention windows (FR47). Verbatim clamps to [7,14]; the tiered
 *  windows have generous floors — they are efficiency hygiene, never a way to
 *  erase durable knowledge (that stays never-expire). */
export async function updateRetention(
  ownerId: string,
  patch: Partial<RetentionSettings>,
): Promise<RetentionSettings> {
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));
  return withOwner(ownerId, async (tx) => {
    const set: Record<string, number> = {};
    if (patch.retentionDays != null) set.retentionDays = clamp(patch.retentionDays, 7, 14);
    if (patch.completedArchiveMonths != null) set.completedArchiveMonths = clamp(patch.completedArchiveMonths, 1, 120);
    if (patch.summaryRetentionMonths != null) set.summaryRetentionMonths = clamp(patch.summaryRetentionMonths, 1, 120);
    const [u] = await tx
      .update(users)
      .set(set)
      .where(eq(users.id, ownerId))
      .returning({
        retentionDays: users.retentionDays,
        completedArchiveMonths: users.completedArchiveMonths,
        summaryRetentionMonths: users.summaryRetentionMonths,
      });
    return u;
  });
}
