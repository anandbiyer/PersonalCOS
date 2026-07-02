import { act, type ActResult } from "./act";
import { parseReminder } from "@/lib/reminders/parse";
import { getPendingReminder, clearPendingReminder } from "@/lib/memory/pending-reminder";

/**
 * FR51 slot-fill continuation. When a reminder was asked-about-with-no-date last
 * turn, THIS turn's message is interpreted as the answer *before* normal intent
 * routing. Returns an ActResult when it handled the turn (completed or
 * cancelled the reminder), or null to let the caller route the message as a
 * fresh request.
 *
 * This is a REQUIRED disambiguation (a specific slot with one expected answer
 * type — a date), not the speculative follow-up the confirm-and-stop policy
 * bans; it's the same family as the existing "which task?" clarifications.
 */

// A closing/negation that abandons the pending reminder.
const CANCEL = /^\s*(never ?mind|nvm|forget it|cancel(?:\s+it)?|forget about it|don'?t bother|leave it|skip it|no thanks?|no)\b[\s.!]*$/i;

export async function tryCompletePendingReminder(
  ownerId: string,
  message: string,
  tz?: string,
): Promise<ActResult | null> {
  const pending = await getPendingReminder(ownerId);
  if (!pending) return null;

  // Explicit cancel/negation clears the slot without filing anything.
  if (CANCEL.test(message)) {
    await clearPendingReminder(ownerId);
    return {
      actions: [{ type: "noop", label: "" }],
      content: `No problem — I won't set a reminder for "${pending.subject}".`,
    };
  }

  // Does the answer carry a date/recurrence on its own? If not, the manager has
  // moved on — drop the slot and let the caller route this message normally.
  const answerCarriesDate = parseReminder(`remind me ${message}`, new Date(), tz) !== null;
  if (!answerCarriesDate) {
    await clearPendingReminder(ownerId);
    return null;
  }

  // Complete the reminder: the remembered subject + this answer's date, run back
  // through the same reminder path (materializes rule + linked calendar task).
  await clearPendingReminder(ownerId);
  return act(ownerId, "reminder", `remind me to ${pending.subject} ${message}`, tz);
}
