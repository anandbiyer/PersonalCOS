import { and, desc, eq } from "drizzle-orm";
import { withOwner } from "@/lib/db";
import { conversations } from "@/lib/db/schema";

export type ConversationPhase = "open" | "work" | "adapt" | "advise" | "close";

/** Open a new day-session (FR44). */
export async function openConversation(ownerId: string) {
  return withOwner(ownerId, async (tx) => {
    const [row] = await tx.insert(conversations).values({ ownerId }).returning();
    return row;
  });
}

/** The owner's most recent session (today's, in practice). */
export async function currentConversation(ownerId: string) {
  return withOwner(ownerId, async (tx) => {
    const [row] = await tx
      .select()
      .from(conversations)
      .orderBy(desc(conversations.startedAt))
      .limit(1);
    return row ?? null;
  });
}

export async function setConversationPhase(
  ownerId: string,
  id: string,
  phase: ConversationPhase,
) {
  return withOwner(ownerId, async (tx) => {
    const [row] = await tx
      .update(conversations)
      .set({ phase })
      .where(and(eq(conversations.id, id), eq(conversations.ownerId, ownerId)))
      .returning();
    return row;
  });
}
