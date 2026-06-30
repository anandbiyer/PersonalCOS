import { and, eq } from "drizzle-orm";
import { withOwner } from "@/lib/db";
import { plans } from "@/lib/db/schema";

export type PlanState = "proposed" | "revised" | "agreed";

export interface CreatePlanInput {
  date: string; // YYYY-MM-DD
  state?: PlanState;
  items?: unknown[];
  changeLog?: unknown[];
}

/** Record a proposed/revised plan (FR45). Only an agreed plan writes the calendar. */
export async function createPlan(ownerId: string, input: CreatePlanInput) {
  return withOwner(ownerId, async (tx) => {
    const [row] = await tx
      .insert(plans)
      .values({
        ownerId,
        date: input.date,
        state: input.state ?? "proposed",
        itemsJson: input.items ?? [],
        changeLogJson: input.changeLog ?? [],
      })
      .returning();
    return row;
  });
}

export async function getPlan(ownerId: string, id: string) {
  return withOwner(ownerId, async (tx) => {
    const [row] = await tx
      .select()
      .from(plans)
      .where(and(eq(plans.id, id), eq(plans.ownerId, ownerId)));
    return row ?? null;
  });
}

/** The agreement gate (FR45) — flips state to agreed and stamps agreed_at. The
 *  caller (Phase 5 commit) then writes the calendar + sets reminders. */
export async function agreePlan(ownerId: string, id: string) {
  return withOwner(ownerId, async (tx) => {
    const [row] = await tx
      .update(plans)
      .set({ state: "agreed", agreedAt: new Date() })
      .where(and(eq(plans.id, id), eq(plans.ownerId, ownerId)))
      .returning();
    return row;
  });
}
