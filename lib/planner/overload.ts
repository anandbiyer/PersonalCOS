import { addDays, sameDay, startOfDay, toDate } from "./dates";
import { isOpen } from "./reminders";
import type { PlanTask } from "./types";

/**
 * Proactive overload & conflict detection (FR22): find upcoming days whose
 * planned discretionary effort exceeds capacity, and suggest what to drop
 * (the lowest-priority item that day).
 */
export interface OverloadDay {
  date: Date;
  totalMin: number;
  capacityMin: number;
  suggestDrop: PlanTask | null;
}

const PRIORITY_RANK: Record<string, number> = { urgent: 3, high: 2, normal: 1, low: 0 };
const DEFAULT_EFFORT = 30;

export function detectOverload(
  tasks: PlanTask[],
  now: Date,
  opts: { days?: number; capacityMin?: number } = {},
): OverloadDay[] {
  const days = opts.days ?? 7;
  const capacityMin = opts.capacityMin ?? 120; // discretionary minutes/day outside fixed blocks
  const out: OverloadDay[] = [];

  for (let d = 0; d < days; d++) {
    const day = addDays(startOfDay(now), d);
    const dayTasks = tasks.filter((t) => {
      const due = toDate(t.dueDate);
      return isOpen(t) && due !== null && sameDay(due, day);
    });
    const totalMin = dayTasks.reduce((s, t) => s + (t.effortMin ?? DEFAULT_EFFORT), 0);
    if (totalMin > capacityMin) {
      const suggestDrop =
        [...dayTasks].sort(
          (a, b) => (PRIORITY_RANK[a.priority ?? "normal"] ?? 1) - (PRIORITY_RANK[b.priority ?? "normal"] ?? 1),
        )[0] ?? null;
      out.push({ date: day, totalMin, capacityMin, suggestDrop });
    }
  }
  return out;
}
