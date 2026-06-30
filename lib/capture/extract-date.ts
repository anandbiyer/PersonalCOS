/**
 * Deterministic natural-language due-date extraction for capture (FR4, FR40),
 * timezone-aware (FR42).
 *
 * Pure and key-free: runs identically online and offline (AI_OFFLINE), so the
 * test suite exercises it directly and capture never depends on an LLM for
 * dates. Classification (kind/portfolio/title) stays with the model; dates are
 * parsed here from the ORIGINAL capture text.
 *
 * Timezone: the caller passes the user's IANA timezone (the capturing device's
 * tz, e.g. "America/New_York"). Wall-clock phrases are interpreted IN THAT TZ
 * and converted to a true UTC instant for storage, so "7-8pm" or "tomorrow"
 * mean 7pm / the next day in the user's local time regardless of where the
 * server runs. Display (the calendar) renders the instant back in the device tz.
 *
 * A date with no explicit time defaults to 21:00 (a 9pm end-of-day deadline) so
 * date-only captures (bills, rent, credit-card payments) surface as a timed
 * "due by" activity rather than an all-day block.
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

/** Default deadline time for date-only captures: 9pm (end-of-day reminder). */
export const DEFAULT_DUE_MINUTES = 21 * 60;

type YMD = { y: number; mo: number; d: number }; // mo is 1-based

/** Wall-clock parts of an instant as seen in `tz`. */
function partsInTz(date: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  let hour = parseInt(o.hour, 10);
  if (hour === 24) hour = 0; // some platforms emit hour "24" for midnight
  return { y: +o.year, mo: +o.month, d: +o.day, hour, minute: +o.minute };
}

/** Convert a wall-clock (mo 1-based) in `tz` to the matching UTC instant. */
function zonedWallToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const p = partsInTz(new Date(guess), tz);
  const wall = Date.UTC(p.y, p.mo - 1, p.d, p.hour, p.minute);
  return new Date(guess - (wall - guess)); // correct by the tz offset at `guess`
}

function addDaysYMD(b: YMD, n: number): YMD {
  const t = new Date(Date.UTC(b.y, b.mo - 1, b.d));
  t.setUTCDate(t.getUTCDate() + n);
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() };
}
function weekdayOfYMD(b: YMD): number {
  return new Date(Date.UTC(b.y, b.mo - 1, b.d)).getUTCDay();
}
function cmpYMD(a: YMD, b: YMD): number {
  return Date.UTC(a.y, a.mo - 1, a.d) - Date.UTC(b.y, b.mo - 1, b.d);
}

/** Minutes-of-day for a recognised clock time, else null. Requires am/pm or
 *  HH:MM to avoid false positives on bare numbers ("5 items"). */
function parseTime(t: string): number | null {
  if (/\bnoon\b/.test(t)) return 12 * 60;
  // Minutes may use a colon OR a period ("5.30pm" — India/UK convention); the
  // am/pm anchor disambiguates so a bare "5.30" is never misread as a time.
  const ampm = t.match(/\b(\d{1,2})(?:[.:](\d{2}))?\s*(?:-\s*\d{1,2}(?:[.:]\d{2})?\s*)?(am|pm)\b/);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = ampm[2] ? parseInt(ampm[2], 10) : 0;
    if (h > 12 || m > 59) return null;
    if (h === 12) h = 0;
    if (ampm[3] === "pm") h += 12;
    return h * 60 + m;
  }
  const h24 = t.match(/\b(?:at\s+)?(\d{1,2}):(\d{2})\b/);
  if (h24) {
    const h = parseInt(h24[1], 10);
    const m = parseInt(h24[2], 10);
    if (h > 23 || m > 59) return null;
    if (h === 0 && m === 0) return null;
    return h * 60 + m;
  }
  return null;
}

/** Resolve a calendar date (in the user's tz) from the text, else null. */
function parseDate(t: string, today: YMD): YMD | null {
  if (/\bday after tomorrow\b/.test(t)) return addDaysYMD(today, 2);
  if (/\btomorrow\b/.test(t)) return addDaysYMD(today, 1);
  if (/\b(today|tonight|this evening)\b/.test(t)) return today;

  const inN = t.match(/\bin\s+(\d{1,3})\s+days?\b/);
  if (inN) return addDaysYMD(today, parseInt(inN[1], 10));
  if (/\bin\s+a\s+week\b/.test(t) || /\bnext\s+week\b/.test(t)) return addDaysYMD(today, 7);

  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return { y: +iso[1], mo: +iso[2], d: +iso[3] };

  const names = Object.keys(MONTHS).join("|");
  let mo: number | undefined, day: number | undefined, year: number | undefined;
  let m = t.match(new RegExp(`\\b(${names})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`));
  if (m) { mo = MONTHS[m[1]] + 1; day = +m[2]; year = m[3] ? +m[3] : undefined; }
  else {
    m = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${names})\\.?(?:,?\\s+(\\d{4}))?\\b`));
    if (m) { day = +m[1]; mo = MONTHS[m[2]] + 1; year = m[3] ? +m[3] : undefined; }
  }
  if (mo !== undefined && day !== undefined && day >= 1 && day <= 31) {
    let cand: YMD = { y: year ?? today.y, mo, d: day };
    if (year === undefined && cmpYMD(cand, today) < 0) cand = { ...cand, y: cand.y + 1 };
    return cand;
  }

  const wd = t.match(new RegExp(`\\b(?:next\\s+)?(${Object.keys(WEEKDAYS).join("|")})\\b`));
  if (wd) {
    const target = WEEKDAYS[wd[1]];
    const base = (target - weekdayOfYMD(today) + 7) % 7;
    return addDaysYMD(today, base === 0 ? 7 : base);
  }
  return null;
}

/**
 * Extract a due date from capture text, interpreted in the user's timezone
 * `tz`. Returns null when no date/time is present (the task stays undated).
 * Time-only inputs ("7-8pm") resolve to today at that time; date-only inputs
 * resolve to that day at the 9pm default. The returned Date is a UTC instant.
 */
export function extractDueDate(text: string, now: Date, tz = "UTC"): Date | null {
  const t = text.toLowerCase();
  const tp = partsInTz(now, tz);
  const today: YMD = { y: tp.y, mo: tp.mo, d: tp.d };
  const date = parseDate(t, today);
  const minutes = parseTime(t);
  if (date === null && minutes === null) return null;

  const target = date ?? today;
  const mins = minutes ?? DEFAULT_DUE_MINUTES;
  return zonedWallToUtc(target.y, target.mo, target.d, Math.floor(mins / 60), mins % 60, tz);
}
