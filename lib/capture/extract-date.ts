import { addDays, startOfDay } from "@/lib/planner/dates";

/**
 * Deterministic natural-language due-date extraction for capture (FR4 support).
 *
 * Pure and key-free: runs identically online and offline (AI_OFFLINE), so the
 * test suite exercises it directly and capture never depends on an LLM for
 * dates. Classification (kind/portfolio/title) stays with the model; dates are
 * parsed here from the ORIGINAL capture text.
 *
 * Convention: matches the rest of the app, which operates in SERVER-LOCAL time
 * (see lib/planner/dates). A date with no clock time is returned at 00:00 so
 * hasClockTime() treats it as all-day; a time sets HH:MM so it renders timed.
 *
 * KNOWN LIMITATION: no timezone conversion — "7pm"/"today" resolve in the
 * server's local time (UTC on Vercel), consistent with how the whole app
 * already handles dates. A tz-aware pass (using users.timezone) is a separate,
 * app-wide follow-up.
 */

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, thursday: 4, thu: 4, thurs: 4, friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

/** Minutes-of-day for a recognised clock time, else null. Takes the start of a
 *  range like "7-8pm". Requires am/pm or HH:MM to avoid false positives on bare
 *  numbers ("5 items"). */
function parseTime(t: string): number | null {
  if (/\bnoon\b/.test(t)) return 12 * 60;
  // "7pm", "7:30pm", "7-8pm", "7 - 8 pm" → take the first hour
  const ampm = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(?:-\s*\d{1,2}(?::\d{2})?\s*)?(am|pm)\b/);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = ampm[2] ? parseInt(ampm[2], 10) : 0;
    if (h > 12 || m > 59) return null;
    if (h === 12) h = 0;
    if (ampm[3] === "pm") h += 12;
    return h * 60 + m;
  }
  // 24h "15:30", optionally "at 15:30"
  const h24 = t.match(/\b(?:at\s+)?(\d{1,2}):(\d{2})\b/);
  if (h24) {
    const h = parseInt(h24[1], 10);
    const m = parseInt(h24[2], 10);
    if (h > 23 || m > 59) return null;
    if (h === 0 && m === 0) return null; // 00:00 would read as all-day
    return h * 60 + m;
  }
  return null;
}

/** Resolve a calendar date (at 00:00 local) from the text, else null. */
function parseDate(t: string, now: Date): Date | null {
  const today = startOfDay(now);

  if (/\bday after tomorrow\b/.test(t)) return addDays(today, 2);
  if (/\btomorrow\b/.test(t)) return addDays(today, 1);
  if (/\b(today|tonight|this evening)\b/.test(t)) return today;

  const inN = t.match(/\bin\s+(\d{1,3})\s+days?\b/);
  if (inN) return addDays(today, parseInt(inN[1], 10));
  if (/\bin\s+a\s+week\b/.test(t) || /\bnext\s+week\b/.test(t)) return addDays(today, 7);

  // ISO yyyy-mm-dd
  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const d = new Date(today);
    d.setFullYear(+iso[1], +iso[2] - 1, +iso[3]);
    return startOfDay(d);
  }

  // "july 5", "jul 5th, 2026"  OR  "5 july", "5th of july 2026"
  const names = Object.keys(MONTHS).join("|");
  let mon: number | undefined, day: number | undefined, year: number | undefined;
  let m = t.match(new RegExp(`\\b(${names})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`));
  if (m) { mon = MONTHS[m[1]]; day = +m[2]; year = m[3] ? +m[3] : undefined; }
  else {
    m = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${names})\\.?(?:,?\\s+(\\d{4}))?\\b`));
    if (m) { day = +m[1]; mon = MONTHS[m[2]]; year = m[3] ? +m[3] : undefined; }
  }
  if (mon !== undefined && day !== undefined && day >= 1 && day <= 31) {
    const d = new Date(today);
    d.setFullYear(year ?? today.getFullYear(), mon, day);
    const out = startOfDay(d);
    // No explicit year and the date already passed → roll to next year.
    if (year === undefined && out.getTime() < today.getTime()) {
      out.setFullYear(out.getFullYear() + 1);
    }
    return startOfDay(out);
  }

  // Weekday name → soonest strictly-future occurrence (a "next" prefix is
  // accepted but not distinguished, to stay predictable).
  const wd = t.match(new RegExp(`\\b(?:next\\s+)?(${Object.keys(WEEKDAYS).join("|")})\\b`));
  if (wd) {
    const target = WEEKDAYS[wd[1]];
    const base = (target - today.getDay() + 7) % 7;
    return addDays(today, base === 0 ? 7 : base);
  }

  return null;
}

/**
 * Extract a due date from capture text. Returns null when no date/time is
 * present (the task stays undated). Time-only inputs ("7-8pm") resolve to today
 * at that time; date-only inputs resolve to that day at 00:00 (all-day).
 */
export function extractDueDate(text: string, now: Date): Date | null {
  const t = text.toLowerCase();
  const date = parseDate(t, now);
  const minutes = parseTime(t);
  if (date === null && minutes === null) return null;

  const base = date ?? startOfDay(now);
  if (minutes === null) return base; // date-only → all-day (00:00)

  const out = new Date(base);
  out.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return out;
}
