import { desc } from "drizzle-orm";
import { withOwner } from "@/lib/db";
import { people, audit } from "@/lib/db/schema";

/**
 * People / stakeholder enablement register (FR19). The most sensitive class —
 * coded references only, RLS-scoped. Tracks what the owner is trying to enable
 * in each person and the last nudge tried.
 */
export interface CreatePersonInput {
  code: string; // coded reference, e.g. "Owner A"
  role?: string | null;
  behaviourToEnable?: string | null;
  lastNudge?: string | null;
  motivators?: string | null;
  notes?: string | null;
}

export async function createPerson(ownerId: string, input: CreatePersonInput) {
  return withOwner(ownerId, async (tx) => {
    const [row] = await tx
      .insert(people)
      .values({
        ownerId,
        code: input.code,
        role: input.role ?? null,
        behaviourToEnable: input.behaviourToEnable ?? null,
        lastNudge: input.lastNudge ?? null,
        motivators: input.motivators ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    await tx.insert(audit).values({ ownerId, changeType: "person.created", newValue: row });
    return row;
  });
}

export async function listPeople(ownerId: string) {
  return withOwner(ownerId, async (tx) =>
    tx.select().from(people).orderBy(desc(people.createdAt)),
  );
}
