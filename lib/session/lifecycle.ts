import { eq } from "drizzle-orm";
import { withOwner } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { currentConversation, openConversation, setConversationPhase } from "@/lib/db/repo/conversations";
import { appendTurn } from "@/lib/db/repo/turns";
import { finalizeDaySummary } from "@/lib/memory/summary";
import { sameDay, toDate } from "@/lib/planner/dates";

/**
 * Daily working session lifecycle (FR44): Open → Work → Adapt → Advise → Close.
 * The COS opens the day proactively (greeting + invitation posted as the first
 * thread turns) and closes it with the evening sweep + a durable day-summary.
 */
async function ownerName(ownerId: string): Promise<string> {
  return withOwner(ownerId, async (tx) => {
    const [u] = await tx.select({ n: users.displayName }).from(users).where(eq(users.id, ownerId));
    return u?.n ?? "";
  });
}

/**
 * Open the day-session — idempotent per calendar day. Posts the COS's proactive
 * opening (greeting + "what would you like to add?") as the first thread turn,
 * so the manager is greeted whether they arrive via the app or the morning cron.
 * Returns true if it opened, false if already opened today.
 */
export async function openDaySession(
  ownerId: string,
  opts: { greeting?: string; name?: string } = {},
): Promise<boolean> {
  const now = new Date();
  const conv = await currentConversation(ownerId);
  if (conv && sameDay(toDate(conv.startedAt)!, now)) return false; // already opened today

  const c = await openConversation(ownerId);
  const name = opts.name ?? (await ownerName(ownerId));
  const greet = opts.greeting ?? "Here's your plan for today";
  const text =
    `${greet}${name ? `, ${name}` : ""}. Reminders are already set on each item. ` +
    "What would you like to add, update, or talk through? I'll handle the filing, scheduling and reminders.";
  await appendTurn(ownerId, { conversationId: c.id, role: "cos", text, intent: "status" });
  return true;
}

/**
 * Close the day-session: post the evening sweep as a turn, mark the session
 * closed, and finalize a durable day-summary (T2, FR46). Regenerable from raw
 * turns while they exist; deterministic offline.
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
