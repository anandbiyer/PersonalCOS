import { addDays, daysBetween, startOfDay, toDate } from "./dates";
import { isOpen } from "./reminders";
import type { PlanTask } from "./types";

/**
 * Automatic replanning (FR8): reschedule missed/unscheduled tasks into upcoming
 * capacity, honouring priority, dependencies, and deadlines.
 *
 * Deterministic priority-topological scheduler:
 *  - candidates = open tasks that are overdue or have no due date
 *  - dependencies place a task on/after the day its dependencies land
 *  - within what's "ready", higher priority then earliest deadline goes first
 *  - each day has a discretionary capacity; tasks spill to the next free day
 *  - a task that can't land on/before its own deadline is flagged a conflict
 *
 * Returns a PROPOSAL (no writes); apply separately.
 */
export interface ReplanItem {
  id: string;
  name: string;
  fromDate: Date | null;
  toDate: Date;
  reason: string;
}

export interface ReplanConflict {
  id: string;
  name: string;
  reason: string;
}

export interface ReplanResult {
  items: ReplanItem[];
  conflicts: ReplanConflict[];
}

const PRIORITY_RANK: Record<string, number> = { urgent: 3, high: 2, normal: 1, low: 0 };
const DEFAULT_EFFORT = 30;

function rank(t: PlanTask): number {
  return PRIORITY_RANK[t.priority ?? "normal"] ?? 1;
}
function deadlineTime(t: PlanTask): number {
  const d = toDate(t.dueDate);
  return d ? startOfDay(d).getTime() : Number.POSITIVE_INFINITY;
}

export function replan(
  tasks: PlanTask[],
  now: Date,
  opts: { capacityMin?: number; horizonDays?: number } = {},
): ReplanResult {
  const capacityMin = opts.capacityMin ?? 120;
  const horizon = opts.horizonDays ?? 14;
  const startDay = addDays(startOfDay(now), 1); // earliest reschedule target = tomorrow

  const open = tasks.filter(isOpen);
  const isOverdue = (t: PlanTask) => {
    const d = toDate(t.dueDate);
    return d !== null && startOfDay(d) < startOfDay(now);
  };
  const candidates = open.filter((t) => isOverdue(t) || toDate(t.dueDate) === null);
  const candidateIds = new Set(candidates.map((c) => c.id));
  const byId = new Map(tasks.map((t) => [t.id, t]));

  // Capacity already consumed by future-scheduled, non-candidate open tasks.
  const load = new Array<number>(horizon).fill(0);
  for (const t of open) {
    if (candidateIds.has(t.id)) continue;
    const d = toDate(t.dueDate);
    if (!d) continue;
    const off = daysBetween(startDay, startOfDay(d));
    if (off >= 0 && off < horizon) load[off] += t.effortMin ?? DEFAULT_EFFORT;
  }

  const placedOffset = new Map<string, number>();
  const items: ReplanItem[] = [];
  const conflicts: ReplanConflict[] = [];

  // Day (offset) a dependency lands on, if it constrains scheduling.
  const depFloor = (depId: string): number | null => {
    if (placedOffset.has(depId)) return placedOffset.get(depId)!;
    const dep = byId.get(depId);
    if (!dep) return null;
    if (dep.status === "completed" || dep.status === "cancelled") return null;
    const d = toDate(dep.dueDate);
    if (!d) return null;
    const off = daysBetween(startDay, startOfDay(d));
    return off; // may be negative (past) -> no real constraint
  };

  const remaining = new Set(candidates.map((c) => c.id));
  while (remaining.size > 0) {
    // "ready" = candidate deps all placed (deps outside the candidate set don't block)
    let ready = candidates.filter(
      (c) =>
        remaining.has(c.id) &&
        (c.dependsOn ?? []).every((d) => !candidateIds.has(d) || placedOffset.has(d)),
    );
    if (ready.length === 0) ready = candidates.filter((c) => remaining.has(c.id)); // cycle break

    ready.sort((a, b) => rank(b) - rank(a) || deadlineTime(a) - deadlineTime(b) || a.name.localeCompare(b.name));
    const pick = ready[0];
    remaining.delete(pick.id);

    let earliest = 0;
    for (const dep of pick.dependsOn ?? []) {
      const f = depFloor(dep);
      if (f !== null && f > earliest) earliest = f;
    }
    // Ordered after a dependency that is itself being (re)scheduled.
    const depConstrained = (pick.dependsOn ?? []).some((d) => candidateIds.has(d));

    const eff = pick.effortMin ?? DEFAULT_EFFORT;
    let offset = Math.max(0, earliest);
    while (offset < horizon && load[offset] + eff > capacityMin) offset++;
    const spilled = offset > Math.max(0, earliest);
    const overflow = offset >= horizon;
    if (overflow) offset = horizon - 1; // pin to last day

    load[offset] += eff;
    placedOffset.set(pick.id, offset);
    const target = addDays(startDay, offset);

    const reason = depConstrained ? "after dependency" : spilled ? "next free slot" : "earliest slot";
    items.push({ id: pick.id, name: pick.name, fromDate: toDate(pick.dueDate), toDate: target, reason });

    const dl = toDate(pick.dueDate);
    if (overflow) {
      conflicts.push({ id: pick.id, name: pick.name, reason: "no capacity within horizon" });
    } else if (dl && startOfDay(dl) >= startOfDay(now) && startOfDay(target) > startOfDay(dl)) {
      // Only a FUTURE deadline we still failed to meet is a conflict; an
      // already-overdue task is simply rescheduled, not re-flagged.
      conflicts.push({ id: pick.id, name: pick.name, reason: "cannot meet deadline within capacity" });
    }
  }

  return { items, conflicts };
}
