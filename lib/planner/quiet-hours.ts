import { minutesOfDay, parseHHMM } from "./dates";

/**
 * Quiet hours (FR6): a single overnight window during which non-critical
 * notifications are held. Default 21:00 → 06:00 (wraps midnight). Critical
 * alerts always pass. A one-off reminder that would fire inside the window is
 * DEFERRED to the window end (06:00) rather than dropped, so nothing is silently
 * lost; recurring reminders are simply suppressed for the fires that land inside.
 */
export const QUIET_START = "21:00";
export const QUIET_END = "06:00"; // next morning

const START_MIN = parseHHMM(QUIET_START);
const END_MIN = parseHHMM(QUIET_END);

/** True when the instant falls inside the overnight quiet window. */
export function isQuietHours(date: Date): boolean {
  const m = minutesOfDay(date);
  // Overnight window wraps midnight: quiet if at/after start OR before end.
  return START_MIN > END_MIN ? m >= START_MIN || m < END_MIN : m >= START_MIN && m < END_MIN;
}

/** True when a notification should be held back (quiet hours, non-critical). */
export function shouldSuppressNotification(
  date: Date,
  opts: { critical?: boolean } = {},
): boolean {
  return isQuietHours(date) && !opts.critical;
}

/**
 * If `date` is inside quiet hours, return the next window-end instant (e.g.
 * 06:00 the following morning for a 21:00–06:00 window); otherwise `date`
 * unchanged. Used to DEFER a reminder's fire time instead of dropping it (FR6).
 */
export function deferPastQuietHours(date: Date): Date {
  if (!isQuietHours(date)) return date;
  const out = new Date(date);
  // Evening portion (at/after start) rolls over to the next day's window end.
  if (START_MIN > END_MIN && minutesOfDay(date) >= START_MIN) {
    out.setDate(out.getDate() + 1);
  }
  out.setHours(Math.floor(END_MIN / 60), END_MIN % 60, 0, 0);
  return out;
}
