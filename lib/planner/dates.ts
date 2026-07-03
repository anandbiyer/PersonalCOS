/** Small, dependency-free date helpers used across the planner. All operate in
 *  local time; callers pass an explicit `now` so logic stays pure/testable. */

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function sameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

/**
 * True when two instants fall on the same CALENDAR DAY in the given IANA tz
 * (FR54). Unlike `sameDay` (which uses the server's local/UTC day), this lets
 * the session-day boundary roll at the owner's local midnight rather than at
 * 00:00 UTC. `en-CA` yields an YYYY-MM-DD string, so a plain compare suffices.
 */
export function sameDayInTz(a: Date, b: Date, tz: string): boolean {
  const day = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  return day(a) === day(b);
}

export function isWeekend(d: Date): boolean {
  const g = d.getDay();
  return g === 0 || g === 6;
}

/** Monday-anchored start of the week. */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay(); // 0 Sun .. 6 Sat
  const shift = day === 0 ? -6 : 1 - day;
  return addDays(x, shift);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}

export function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function hasClockTime(d: Date): boolean {
  return !(d.getHours() === 0 && d.getMinutes() === 0);
}

export function toDate(v: Date | string | null | undefined): Date | null {
  if (v == null) return null;
  return v instanceof Date ? v : new Date(v);
}
