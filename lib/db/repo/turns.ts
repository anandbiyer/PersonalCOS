import { and, desc, eq } from "drizzle-orm";
import { withOwner } from "@/lib/db";
import { conversationTurns } from "@/lib/db/schema";

export interface AppendTurnInput {
  conversationId?: string | null;
  role: "cos" | "user";
  text: string;
  intent?: string | null;
  actionsJson?: unknown[];
  refsTaskId?: string | null;
}

/** Append a verbatim turn (T1). The ONLY tier subject to retention/pruning. */
export async function appendTurn(ownerId: string, input: AppendTurnInput) {
  return withOwner(ownerId, async (tx) => {
    const [row] = await tx
      .insert(conversationTurns)
      .values({
        ownerId,
        conversationId: input.conversationId ?? null,
        role: input.role,
        text: input.text,
        intent: input.intent ?? null,
        actionsJson: input.actionsJson ?? [],
        refsTaskId: input.refsTaskId ?? null,
      })
      .returning();
    return row;
  });
}

/** Most recent N turns, oldest-first (sliding window for the context assembler). */
export async function lastTurns(ownerId: string, n = 6) {
  return withOwner(ownerId, async (tx) => {
    const rows = await tx
      .select()
      .from(conversationTurns)
      .orderBy(desc(conversationTurns.createdAt))
      .limit(n);
    return rows.reverse();
  });
}

/** Completion-triggered early pruning (FR47): flag turns referencing a
 *  completed task so the retention sweep can drop them ahead of the window. */
export async function markTurnsPruneEligible(ownerId: string, taskId: string) {
  return withOwner(ownerId, async (tx) => {
    await tx
      .update(conversationTurns)
      .set({ pruneEligible: true })
      .where(
        and(
          eq(conversationTurns.ownerId, ownerId),
          eq(conversationTurns.refsTaskId, taskId),
        ),
      );
  });
}
