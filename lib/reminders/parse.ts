import { extractDueDate, lastDayOfMonthDue, REMINDER_DEFAULT_MINUTES } from "@/lib/capture/extract-date";
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
 *   "rent on the last day of every month"       → monthly {day:"last"}, 20:30
 *   "renew the pass in a fortnight"             → one_off, today+14 at 20:30
 *
 * Date-only reminders default to 20:30 (REMINDER_DEFAULT_MINUTES) — just before
 * quiet hours — rather than the 21:00 general-capture default (FR50).
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

/**
 * Recurring monthly-on-the-last-day cue (FR50). Requires an "every month" /
 * "monthly" / "each month" recurrence marker, so a one-off "last day of this
 * month" (no recurrence) is NOT captured here and falls through to the one-off
 * path. Only {day:"last"} is in scope for this increment.
 */
const MONTHLY_LAST_DAY =
  /\blast day of every month\b|\b(?:every|each) month(?:'?s)?\s+last day\b|\bmonthly(?: on)?(?: the)? last day\b|\blast day of the month\b[^.]*\b(?:every|each) month\b|\bevery month\b[^.]*\blast day\b/;

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
    // Leading framing ("remind me to …") AND trailing framing ("…, please set a
    // reminder") — the request often puts the ask after the thing (FR50).
    .replace(/^\s*(please\s+)?(remind me|set (a|an)? ?reminder|reminder)\s*/i, "")
    .replace(/[.,;]?\s*(please\s+)?(set (a|an)? ?reminder|remind me)(\s+(to|about|for))?\s*\.?\s*$/i, "")
    .replace(/^\s*(to|about|that|for)\s+/i, "")
    .replace(/\bevery\s+\d+\s*(hours?|hrs?|minutes?|mins?)\b/gi, "")
    .replace(/\bevery\s+(morning|day|afternoon|evening|night)\b/gi, "")
    // FR50 relative/recurring date phrases.
    .replace(/\blast day of (?:the |this |every |next )?month\b/gi, "")
    .replace(/\bend of (?:the |this )?month\b/gi, "")
    .replace(/\bmonth[-\s]?end\b/gi, "")
    .replace(/\bevery month\b/gi, "")
    .replace(/\b(?:last day|end) of (?:the |this )?week\b/gi, "")
    .replace(/\b(?:in\s+a\s+)?fortnight\b/gi, "")
    .replace(/\btwo\s+weeks?\s+from\s+(?:now|today)\b/gi, "")
    .replace(/\b(tomorrow|today|tonight|next \w+)\b/gi, "")
    .replace(/\bat\s+\d{1,2}(?:[:.]\d{2})?\s*(am|pm)?\b/gi, "")
    .replace(/\b\d{1,2}(?:[:.]\d{2})?\s*(am|pm)\b/gi, "")
    // Absolute + bare dates, so a slot-fill answer ("the 15th", "next Friday")
    // never lands in the remembered subject / task name (FR51).
    .replace(/\b(?:on|by)?\s*the\s+\d{1,2}(?:st|nd|rd|th)\b/gi, "")
    .replace(
      /\b(?:on\s+|by\s+|this\s+|next\s+)?(?:sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thu|friday|fri|saturday|sat)\b/gi,
      "",
    )
    .replace(
      /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b/gi,
      "",
    )
    .replace(
      /\b\d{1,2}(?:st|nd|rd|th)?\s+of\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/gi,
      "",
    )
    .replace(/\bin\s+\d{1,3}\s+days?\b/gi, "")
    .replace(/\b(?:in\s+a\s+week|next\s+week|next\s+month)\b/gi, "")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "")
    // Dangling connectives left after the date phrase is removed ("… due on the ⌴").
    .replace(/[\s,.]*\b(?:due(?:\s+(?:on|by))?|on|by|for)\b(?:\s+the)?[\s,.]*$/i, "")
    .replace(/[\s,.]*\b(?:the|this|a|an)\b[\s,.]*$/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.-]+|[\s,.-]+$/g, "")
    .trim();
  if (!s) s = "reminder";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The thing being nudged, stripped of reminder framing + schedule tail. Used
 *  by the FR51 slot-fill to remember what to ask a date for. */
export function reminderSubject(text: string): string {
  return extractSubject(text);
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

  // Recurring: "last day of every month" (and equivalents) → monthly {day:"last"}.
  // Fire on the last day of the CURRENT month at the explicit-or-20:30 time; if
  // that instant has already passed, roll to next month's last day. tz travels
  // in scheduleConfig so computeNextFire recomputes the boundary in-zone (FR50).
  if (MONTHLY_LAST_DAY.test(t)) {
    let fire = lastDayOfMonthDue(now, tz, 0, text);
    if (fire.getTime() <= now.getTime()) fire = lastDayOfMonthDue(now, tz, 1, text);
    return {
      subject,
      schedule: "monthly",
      scheduleConfig: { day: "last", tz },
      nextFire: fire,
      recurring: true,
    };
  }

  // One-off: needs an absolute/relative date or time from the text. Date-only
  // reminders take the 20:30 reminder default (not the 21:00 capture default).
  const at = extractDueDate(text, now, tz, REMINDER_DEFAULT_MINUTES);
  if (!at) return null;
  return { subject, schedule: "one_off", scheduleConfig: null, nextFire: at, recurring: false };
}
