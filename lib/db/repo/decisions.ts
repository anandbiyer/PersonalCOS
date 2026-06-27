import { desc } from "drizzle-orm";
import { withOwner } from "@/lib/db";
import { decisions, audit } from "@/lib/db/schema";

export interface CreateDecisionInput {
  context: string;
  alternatives?: unknown[];
  choice?: string | null;
  reasoning?: string | null;
  initiativeId?: string | null;
  taskIds?: string[];
}

/** Decision & recommendation repository (FR12), linked to initiatives/tasks. */
export async function createDecision(ownerId: string, input: CreateDecisionInput) {
  return withOwner(ownerId, async (tx) => {
    const [row] = await tx
      .insert(decisions)
      .values({
        ownerId,
        context: input.context,
        alternatives: input.alternatives ?? [],
        choice: input.choice ?? null,
        reasoning: input.reasoning ?? null,
        initiativeId: input.initiativeId ?? null,
        taskIds: input.taskIds ?? null,
      })
      .returning();
    await tx
      .insert(audit)
      .values({ ownerId, changeType: "decision.created", newValue: row });
    return row;
  });
}

export async function listDecisions(ownerId: string) {
  return withOwner(ownerId, async (tx) =>
    tx.select().from(decisions).orderBy(desc(decisions.createdAt)),
  );
}
