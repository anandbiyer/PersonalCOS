import { and, desc, eq } from "drizzle-orm";
import { withOwner } from "@/lib/db";
import { memoryFacts } from "@/lib/db/schema";

export type FactKind = "preference" | "commitment" | "fact";

export interface AddFactInput {
  kind: FactKind;
  subject?: string | null;
  value: string;
  sourceTurnId?: string | null;
  confidence?: number | null;
  /** Durable knowledge defaults to never-expire (FR47 §4.6.1). */
  neverExpire?: boolean;
}

export async function addFact(ownerId: string, input: AddFactInput) {
  return withOwner(ownerId, async (tx) => {
    const [row] = await tx
      .insert(memoryFacts)
      .values({
        ownerId,
        kind: input.kind,
        subject: input.subject ?? null,
        value: input.value,
        sourceTurnId: input.sourceTurnId ?? null,
        confidence: input.confidence ?? null,
        neverExpire: input.neverExpire ?? true,
      })
      .returning();
    return row;
  });
}

export async function updateFact(
  ownerId: string,
  id: string,
  patch: { value?: string; subject?: string | null; active?: boolean },
) {
  return withOwner(ownerId, async (tx) => {
    const [row] = await tx
      .update(memoryFacts)
      .set(patch)
      .where(and(eq(memoryFacts.id, id), eq(memoryFacts.ownerId, ownerId)))
      .returning();
    return row;
  });
}

/** Explicit, user-initiated delete — the ONLY way to remove durable knowledge
 *  (FR48). No timer/cron may delete a fact. */
export async function deleteFact(ownerId: string, id: string) {
  return withOwner(ownerId, async (tx) => {
    await tx
      .delete(memoryFacts)
      .where(and(eq(memoryFacts.id, id), eq(memoryFacts.ownerId, ownerId)));
  });
}

export async function listFacts(
  ownerId: string,
  opts: { activeOnly?: boolean } = {},
) {
  return withOwner(ownerId, async (tx) => {
    const conds = [eq(memoryFacts.ownerId, ownerId)];
    if (opts.activeOnly) conds.push(eq(memoryFacts.active, true));
    return tx
      .select()
      .from(memoryFacts)
      .where(and(...conds))
      .orderBy(desc(memoryFacts.updatedAt));
  });
}
