import { extractDueDate } from "@/lib/capture/extract-date";
import type { ReminderScheduleKind } from "@/lib/reminders/schedule";

/**
 * Deterministic parse of a natural-language reminder request (FR6 / FR38) into a
 * schedule the reminder engine already understands. Pure and key-free, so the
 * conversational path behaves identically online and offline.
 *
 *   "remind me to call the plumber at 9pm"      → one_off, fires today 21:00
 *   "remind me about the workbook tomorrow 8am" → one_off, fires tomorrow 08:00
 *   "remind me to stretch every 2 hours"        → every_n_hours {hours:2}
 *   "remind me every morning at 7am to review"  → daily, next 07:00
 *
 * Returns null when no schedulable time/recurrence is present — the caller then
 * falls back to plain task capture.
 */
export interface ParsedReminder {
  subject: string;
  schedule: ReminderScheduleKind;
  scheduleConfig: Record<string, unknown> | null;
  nextFire: Date;
  recurring: boolean;
}

/** Default hour for a named part-of-day when no explicit clock time is given. */
const PART_OF_DAY: Record<string, string> = {
  morning: "7am",
  day: "9am",
  afternoon: "2pm",
  evening: "6pm",
  night: "9pm",
};

/** Strip the reminder framing + schedule tail down to the thing being nudged. */
function extractSubject(text: string): string {
  let s = text
    .replace(/^\s*(please\s+)?(remind me|set (a|an)? ?reminder|reminder)\s*/i, "")
    .replace(/^\s*(to|about|that|for)\s+/i, "")
    .replace(/\bevery\s+\d+\s*(hours?|hrs?|minutes?|mins?)\b/gi, "")
    .replace(/\bevery\s+(morning|day|afternoon|evening|night)\b/gi, "")
    .replace(/\b(tomorrow|today|tonight|next \w+)\b/gi, "")
    .replace(/\bat\s+\d{1,2}(?:[:.]\d{2})?\s*(am|pm)?\b/gi, "")
    .replace(/\b\d{1,2}(?:[:.]\d{2})?\s*(am|pm)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.-]+|[\s,.-]+$/g, "")
    .trim();
  if (!s) s = "reminder";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function parseReminder(text: string, now: Date, tz = "UTC"): ParsedReminder | null {
  const t = text.toLowerCase();
  const subject = extractSubject(text);

  // Recurring: "every N hours" → every_n_hours.
  const everyHours = t.match(/\bevery\s+(\d+)\s*(hours?|hrs?)\b/);
  if (everyHours) {
    const hours = Math.max(1, parseInt(everyHours[1], 10));
    return {
      subject,
      schedule: "every_n_hours",
      scheduleConfig: { hours },
      nextFire: new Date(now.getTime() + hours * 3_600_000),
      recurring: true,
    };
  }

  // Recurring: "every morning / every day (at 7am)" → daily at that clock time.
  const everyDay = t.match(/\bevery\s+(morning|day|afternoon|evening|night)\b/);
  if (everyDay || /\bevery day\b/.test(t)) {
    const part = everyDay?.[1] ?? "day";
    // Prefer an explicit time in the message, else the part-of-day default.
    const explicit = extractDueDate(t, now, tz);
    let fire = explicit ?? extractDueDate(PART_OF_DAY[part], now, tz)!;
    if (fire.getTime() <= now.getTime()) fire = new Date(fire.getTime() + 86_400_000);
    return { subject, schedule: "daily", scheduleConfig: { at: part }, nextFire: fire, recurring: true };
  }

  // One-off: needs an absolute time/date from the text.
  const at = extractDueDate(text, now, tz);
  if (!at) return null;
  return { subject, schedule: "one_off", scheduleConfig: null, nextFire: at, recurring: false };
}
