import { desc, eq } from "drizzle-orm";
import { withOwner } from "@/lib/db";
import { initiatives, audit, initiativeStage, knowledgeSource } from "@/lib/db/schema";
import type { Portfolio } from "@/lib/ai/types";
import { canEnterStage, isStalled } from "@/lib/initiatives/invariant";

type Stage = (typeof initiativeStage.enumValues)[number];
type Knowledge = (typeof knowledgeSource.enumValues)[number];

export interface CreateInitiativeInput {
  name: string;
  portfolio: Portfolio;
  stage?: Stage;
  outcome?: string | null;
  nextAction?: string | null;
  nextReview?: Date | null;
  knowledgeSource?: Knowledge;
  externalDeadline?: Date | null;
}

/** Basic initiative management (FR3). Stage gates + anti-ideation invariant
 *  enforcement land in Phase 3; this is the persistence foundation. */
export async function createInitiative(ownerId: string, input: CreateInitiativeInput) {
  return withOwner(ownerId, async (tx) => {
    const stage = input.stage ?? "idea";
    const stalled = isStalled({
      stage,
      nextAction: input.nextAction ?? null,
      nextReview: input.nextReview ?? null,
    });
    const [row] = await tx
      .insert(initiatives)
      .values({
        ownerId,
        name: input.name,
        portfolio: input.portfolio,
        stage,
        outcome: input.outcome ?? null,
        nextAction: input.nextAction ?? null,
        nextReview: input.nextReview ?? null,
        knowledgeSource: input.knowledgeSource ?? "self",
        externalDeadline: input.externalDeadline ?? null,
        stalled,
        heartbeatAt: new Date(),
      })
      .returning();
    await tx
      .insert(audit)
      .values({ ownerId, changeType: "initiative.created", newValue: row });
    return row;
  });
}

export async function listInitiatives(ownerId: string) {
  return withOwner(ownerId, async (tx) =>
    tx.select().from(initiatives).orderBy(desc(initiatives.createdAt)),
  );
}

export async function getInitiative(ownerId: string, id: string) {
  return withOwner(ownerId, async (tx) => {
    const [row] = await tx.select().from(initiatives).where(eq(initiatives.id, id));
    return row ?? null;
  });
}

/** Set the next action + review date and recompute the stalled flag. */
export async function setNextAction(
  ownerId: string,
  id: string,
  nextAction: string,
  nextReview: Date,
) {
  return withOwner(ownerId, async (tx) => {
    const [prev] = await tx.select().from(initiatives).where(eq(initiatives.id, id));
    if (!prev) return null;
    const stalled = isStalled({ stage: prev.stage, nextAction, nextReview });
    const [row] = await tx
      .update(initiatives)
      .set({ nextAction, nextReview, stalled, heartbeatAt: new Date() })
      .where(eq(initiatives.id, id))
      .returning();
    await tx.insert(audit).values({
      ownerId,
      changeType: "initiative.next_action",
      prevValue: prev,
      newValue: row,
    });
    return row;
  });
}

/**
 * Advance (or move) an initiative to a stage, enforcing the anti-ideation
 * stage gate: entering an active stage requires a next action + next review.
 * Throws if the gate is not satisfied.
 */
export async function advanceStage(
  ownerId: string,
  id: string,
  toStage: Stage,
  opts: { nextAction?: string | null; nextReview?: Date | null; outcome?: string | null } = {},
) {
  return withOwner(ownerId, async (tx) => {
    const [prev] = await tx.select().from(initiatives).where(eq(initiatives.id, id));
    if (!prev) throw new Error("initiative not found");

    const nextAction = opts.nextAction ?? prev.nextAction;
    const nextReview = opts.nextReview ?? prev.nextReview;
    const gate = canEnterStage(toStage, nextAction, nextReview);
    if (!gate.ok) throw new Error(gate.reason);

    const stalled = isStalled({ stage: toStage, nextAction, nextReview });
    const [row] = await tx
      .update(initiatives)
      .set({
        stage: toStage,
        nextAction,
        nextReview,
        outcome: opts.outcome ?? prev.outcome,
        stalled,
        heartbeatAt: new Date(),
      })
      .where(eq(initiatives.id, id))
      .returning();
    await tx.insert(audit).values({
      ownerId,
      changeType: "initiative.stage",
      prevValue: prev,
      newValue: row,
    });
    return row;
  });
}

/** Set knowledge-source metadata + external deadline (used by study planning). */
export async function setStudyMeta(
  ownerId: string,
  id: string,
  meta: { externalDeadline?: Date | null; knowledgeSource?: Knowledge },
) {
  return withOwner(ownerId, async (tx) => {
    const [row] = await tx
      .update(initiatives)
      .set({
        externalDeadline: meta.externalDeadline ?? undefined,
        knowledgeSource: meta.knowledgeSource ?? undefined,
      })
      .where(eq(initiatives.id, id))
      .returning();
    return row ?? null;
  });
}

/** Re-evaluate and persist the stalled flag for all of an owner's initiatives
 *  (used by the weekly review cron in Phase 4; safe to call anytime). */
export async function recomputeStalled(ownerId: string): Promise<number> {
  return withOwner(ownerId, async (tx) => {
    const rows = await tx.select().from(initiatives);
    let changed = 0;
    for (const r of rows) {
      const stalled = isStalled(r);
      if (stalled !== r.stalled) {
        await tx.update(initiatives).set({ stalled }).where(eq(initiatives.id, r.id));
        changed++;
      }
    }
    return changed;
  });
}
