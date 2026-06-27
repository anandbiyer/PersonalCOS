import { addDays, daysBetween, sameDay, startOfDay, toDate } from "./dates";
import type { PlanTask } from "./types";

/**
 * Missed-task detection (FR7), due-soon scanning (FR6), and waiting-on
 * tracking (FR23). Pure functions over task lists; the caller supplies `now`.
 */

const OPEN_STATUSES = new Set([
  "created",
  "planned",
  "in_progress",
  "blocked",
  "waiting",
  "delegated",
  "overdue",
  "replanned",
]);

export function isOpen(t: PlanTask): boolean {
  return OPEN_STATUSES.has(t.status);
}

/** Open tasks whose due date is before today. */
export function overdueTasks(tasks: PlanTask[], now: Date): PlanTask[] {
  return tasks.filter((t) => {
    const due = toDate(t.dueDate);
    return isOpen(t) && due !== null && startOfDay(due) < startOfDay(now);
  });
}

/** Open tasks due on `now`'s calendar day. */
export function dueToday(tasks: PlanTask[], now: Date): PlanTask[] {
  return tasks.filter((t) => {
    const due = toDate(t.dueDate);
    return isOpen(t) && due !== null && sameDay(due, now);
  });
}

/** Open tasks due within the next `days` days (today exclusive of overdue). */
export function dueWithin(tasks: PlanTask[], now: Date, days: number): PlanTask[] {
  const today = startOfDay(now);
  const limit = startOfDay(addDays(now, days + 1));
  return tasks.filter((t) => {
    const due = toDate(t.dueDate);
    return (
      isOpen(t) && due !== null && startOfDay(due) >= today && due < limit
    );
  });
}

export interface WaitingItem {
  task: PlanTask;
  nudgeDays: number;
}

export interface WaitingSplit {
  youOwe: WaitingItem[];
  owedToYou: WaitingItem[];
}

/**
 * Split open commitments into "owed to you" (you're waiting on someone —
 * waiting/delegated) and "you owe" (your active task with a named stakeholder).
 * nudgeDays = days since the task last moved (FR23 auto-nudge basis).
 */
export function categorizeWaiting(tasks: PlanTask[], now: Date): WaitingSplit {
  const nudge = (t: PlanTask) => {
    const updated = toDate(t.updatedAt) ?? now;
    return Math.max(0, daysBetween(updated, now));
  };
  const owedToYou = tasks
    .filter((t) => t.status === "waiting" || t.status === "delegated")
    .map((t) => ({ task: t, nudgeDays: nudge(t) }));
  const youOwe = tasks
    .filter(
      (t) =>
        (t.status === "planned" || t.status === "in_progress") && !!t.owner,
    )
    .map((t) => ({ task: t, nudgeDays: nudge(t) }));
  return { youOwe, owedToYou };
}
