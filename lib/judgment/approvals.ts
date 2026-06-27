import { and, eq } from "drizzle-orm";
import { withOwner } from "@/lib/db";
import { audit } from "@/lib/db/schema";

/**
 * Approval-first execution with graduated trust (FR26). Side-effecting actions
 * are proposed (recorded as a pending audit/receipt) and only run once
 * approved — except action types the owner has marked trusted, which run
 * automatically. Receipts live in the audit log.
 */
export type ActionType = "reminder" | "nudge" | "brief" | "web_action" | "external_send";

// Low-risk, always-auto action types (no approval needed).
const ALWAYS_AUTO = new Set<ActionType>(["reminder", "nudge", "brief"]);

export function requiresApproval(actionType: ActionType, trustedTypes: Set<string> = new Set()): boolean {
  if (ALWAYS_AUTO.has(actionType)) return false;
  return !trustedTypes.has(actionType); // graduated trust: trusted -> auto
}

export async function proposeAction(
  ownerId: string,
  actionType: ActionType,
  detail: Record<string, unknown>,
): Promise<string> {
  return withOwner(ownerId, async (tx) => {
    const [row] = await tx
      .insert(audit)
      .values({
        ownerId,
        changeType: "action.proposed",
        actionTaken: actionType,
        approvalState: "pending",
        newValue: detail,
      })
      .returning();
    return row.id;
  });
}

export async function approveAction(ownerId: string, auditId: string): Promise<boolean> {
  return withOwner(ownerId, async (tx) => {
    const res = await tx
      .update(audit)
      .set({ approvalState: "approved" })
      .where(and(eq(audit.id, auditId), eq(audit.approvalState, "pending")))
      .returning();
    return res.length > 0;
  });
}
