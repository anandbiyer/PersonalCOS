import { isOpen } from "./reminders";
import { startOfDay, toDate } from "./dates";
import type { Portfolio } from "@/lib/ai/types";

/**
 * Past-due triage set (FR55). The actionable overdue tasks the COS surfaces for
 * Done / Reschedule / Drop. Pure over ledger rows — routine template blocks
 * aren't ledger tasks, so they're naturally excluded; completed/cancelled are
 * excluded by isOpen; archived rows are dropped explicitly. Oldest-due first
 * (most overdue at the top), capped so a big backlog doesn't produce a wall.
 */
export const DEFAULT_TRIAGE_CAP = 7;

/** Minimum shape needed from a ledger task row. Structural superset of PlanTask. */
export interface OverdueTaskRow {
  id: string;
  name: string;
  portfolio: Portfolio;
  status: string;
  dueDate: Date | string | null;
  effortMin?: number | null;
  reminderRuleId?: string | null;
  archivedAt?: Date | string | null;
}

/** One row of the triage card. `dueDate` is an ISO string for the client. */
export interface OverdueTriageItem {
  id: string;
  name: string;
  portfolio: Portfolio;
  dueDate: string | null;
  effortMin: number | null;
  reminderRuleId: string | null;
}

export function overdueTriageItems(
  tasks: OverdueTaskRow[],
  now: Date,
  opts: { cap?: number } = {},
): { items: OverdueTriageItem[]; overflow: number } {
  const cap = opts.cap ?? DEFAULT_TRIAGE_CAP;
  const today = startOfDay(now);

  const overdue = tasks
    .filter((t) => {
      if (t.archivedAt) return false;
      if (!isOpen(t)) return false; // excludes completed / cancelled
      const due = toDate(t.dueDate);
      return due !== null && startOfDay(due) < today; // strictly before today
    })
    // Oldest-due first so the most-overdue item is triaged first.
    .sort((a, b) => (toDate(a.dueDate)?.getTime() ?? 0) - (toDate(b.dueDate)?.getTime() ?? 0));

  const items: OverdueTriageItem[] = overdue.slice(0, cap).map((t) => {
    const due = toDate(t.dueDate);
    return {
      id: t.id,
      name: t.name,
      portfolio: t.portfolio,
      dueDate: due ? due.toISOString() : null,
      effortMin: t.effortMin ?? null,
      reminderRuleId: t.reminderRuleId ?? null,
    };
  });

  return { items, overflow: Math.max(0, overdue.length - items.length) };
}
