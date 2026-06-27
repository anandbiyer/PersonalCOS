import { and, eq } from "drizzle-orm";
import { withOwner } from "@/lib/db";
import { invitations, tasks, audit } from "@/lib/db/schema";

/**
 * Cross-user hand-off (FR37) — the ONLY cross-tenant object. An invitation
 * carries only the sender's typed fields. On accept, a brand-new task is
 * created in the recipient's own ledger (copy-on-accept) and decoupled; the
 * sender only ever sees accepted/declined status.
 */
export interface CreateInvitationInput {
  recipientId: string;
  title: string;
  dueDate?: Date | null;
  note?: string | null;
}

export async function createInvitation(senderId: string, input: CreateInvitationInput) {
  return withOwner(senderId, async (tx) => {
    const [row] = await tx
      .insert(invitations)
      .values({
        senderId,
        recipientId: input.recipientId,
        title: input.title,
        dueDate: input.dueDate ?? null,
        note: input.note ?? null,
        status: "pending",
      })
      .returning();
    await tx.insert(audit).values({ ownerId: senderId, changeType: "invitation.sent", newValue: row });
    return row;
  });
}

/** Pending hand-offs addressed to this owner. */
export async function listInbox(ownerId: string) {
  return withOwner(ownerId, async (tx) =>
    tx
      .select()
      .from(invitations)
      .where(and(eq(invitations.recipientId, ownerId), eq(invitations.status, "pending"))),
  );
}

/** Hand-offs this owner has sent (status only is meaningful to them). */
export async function listSent(ownerId: string) {
  return withOwner(ownerId, async (tx) =>
    tx.select().from(invitations).where(eq(invitations.senderId, ownerId)),
  );
}

/** Accept: copy-on-accept into the recipient's own ledger, then close the
 *  invitation. Only the recipient may accept. */
export async function acceptInvitation(ownerId: string, invitationId: string) {
  return withOwner(ownerId, async (tx) => {
    const [inv] = await tx.select().from(invitations).where(eq(invitations.id, invitationId));
    if (!inv || inv.recipientId !== ownerId || inv.status !== "pending") return null;

    const [task] = await tx
      .insert(tasks)
      .values({
        ownerId, // owned by the recipient — independent copy
        name: inv.title,
        portfolio: "personal_life",
        dueDate: inv.dueDate,
        notes: inv.note,
        source: "text",
        status: inv.dueDate ? "planned" : "created",
      })
      .returning();

    const [updated] = await tx
      .update(invitations)
      .set({ status: "accepted" })
      .where(eq(invitations.id, invitationId))
      .returning();

    await tx.insert(audit).values({
      ownerId,
      changeType: "invitation.accepted",
      prevValue: inv,
      newValue: { invitation: updated, task },
    });
    return { task, invitation: updated };
  });
}

export async function declineInvitation(ownerId: string, invitationId: string) {
  return withOwner(ownerId, async (tx) => {
    const [inv] = await tx.select().from(invitations).where(eq(invitations.id, invitationId));
    if (!inv || inv.recipientId !== ownerId || inv.status !== "pending") return null;
    const [updated] = await tx
      .update(invitations)
      .set({ status: "declined" })
      .where(eq(invitations.id, invitationId))
      .returning();
    await tx.insert(audit).values({ ownerId, changeType: "invitation.declined", newValue: updated });
    return updated;
  });
}
