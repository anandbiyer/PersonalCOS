import { currentConversation, openConversation, setConversationPhase } from "@/lib/db/repo/conversations";
import { appendTurn } from "@/lib/db/repo/turns";
import { finalizeDaySummary } from "@/lib/memory/summary";
import { sameDay, toDate } from "@/lib/planner/dates";

/**
 * Daily working session lifecycle (FR44): Open → Work → Adapt → Advise → Close.
 * The COS's proactive *opening* (greeting → plan → invitation) is rendered
 * client-side by <SessionView> in the device timezone, matching the mockup;
 * this module manages the session *record* (a conversation per day) and the
 * *close* (evening sweep + a durable day-summary).
 */

/**
 * Open the day-session record — idempotent per calendar day. Ensures a
 * conversation exists so the day's turns and phase have a home. Returns true if
 * it opened, false if already opened today. Called proactively by cron/brief
 * and lazily on the first home visit.
 */
export async function openDaySession(ownerId: string): Promise<boolean> {
  const now = new Date();
  const conv = await currentConversation(ownerId);
  if (conv && sameDay(toDate(conv.startedAt)!, now)) return false; // already opened today
  await openConversation(ownerId);
  return true;
}

/**
 * Close the day-session: post the evening sweep as a turn, mark the session
 * closed, and finalize a durable day-summary (T2, FR46). Deterministic offline.
 */
export async function closeDaySession(ownerId: string, sweepText: string): Promise<void> {
  const now = new Date();
  const conv = await currentConversation(ownerId);
  if (conv) {
    await appendTurn(ownerId, { conversationId: conv.id, role: "cos", text: sweepText, intent: "status" });
    await setConversationPhase(ownerId, conv.id, "close");
  }
  await finalizeDaySummary(ownerId, now.toISOString().slice(0, 10));
}
