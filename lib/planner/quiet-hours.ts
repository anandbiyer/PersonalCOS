import { minutesOfDay, parseHHMM } from "./dates";

/**
 * Quiet hours (FR6 / Requirements §4): Family 20:00–21:00 and Reading
 * 21:15–22:00. Non-critical notifications are suppressed in these windows;
 * critical alerts always pass.
 */
export interface QuietWindow {
  name: string;
  start: string;
  end: string;
}

export const QUIET_WINDOWS: QuietWindow[] = [
  { name: "Family", start: "20:00", end: "21:00" },
  { name: "Reading", start: "21:15", end: "22:00" },
];

export function quietWindowAt(date: Date): QuietWindow | null {
  const m = minutesOfDay(date);
  return (
    QUIET_WINDOWS.find((w) => m >= parseHHMM(w.start) && m < parseHHMM(w.end)) ??
    null
  );
}

export function isQuietHours(date: Date): boolean {
  return quietWindowAt(date) !== null;
}

/** True when a notification should be held back (quiet hours, non-critical). */
export function shouldSuppressNotification(
  date: Date,
  opts: { critical?: boolean } = {},
): boolean {
  return isQuietHours(date) && !opts.critical;
}
