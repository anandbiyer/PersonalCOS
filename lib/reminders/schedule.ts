import { monthlyLastDayNextFire } from "@/lib/capture/extract-date";

/**
 * Interval-reminder scheduling (FR38). Computes the next fire time after a rule
 * fires. one_off rules don't recur (null -> deactivated by the caller).
 */
export type ReminderScheduleKind = "one_off" | "daily" | "every_n_hours" | "monthly" | "cron";

export function computeNextFire(
  kind: ReminderScheduleKind,
  config: Record<string, unknown> | null | undefined,
  from: Date,
): Date | null {
  switch (kind) {
    case "daily":
      return new Date(from.getTime() + 24 * 60 * 60 * 1000);
    case "every_n_hours": {
      const hours = Number(config?.hours) || 1;
      return new Date(from.getTime() + hours * 60 * 60 * 1000);
    }
    case "monthly": {
      // FR50: recurring on the LAST day of each month. Only {day:"last"} is in
      // scope. tz travels in config so the last-day boundary + wall-clock time
      // are computed in the owner's zone, not UTC.
      const tz = typeof config?.tz === "string" ? config.tz : "UTC";
      return monthlyLastDayNextFire(from, tz);
    }
    case "one_off":
      return null;
    case "cron":
      // Full cron parsing arrives with the scheduler hardening; until then a
      // cron rule fires once then stops.
      return null;
    default:
      return null;
  }
}
