/**
 * Interval-reminder scheduling (FR38). Computes the next fire time after a rule
 * fires. one_off rules don't recur (null -> deactivated by the caller).
 */
export type ReminderScheduleKind = "one_off" | "daily" | "every_n_hours" | "cron";

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
