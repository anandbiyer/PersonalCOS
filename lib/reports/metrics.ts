import type { Portfolio } from "@/lib/ai/types";
import { daysBetween, startOfDay, toDate } from "@/lib/planner/dates";
import { dueWithin, overdueTasks } from "@/lib/planner/reminders";
import type { PlanTask } from "@/lib/planner/types";

/** Weekly/monthly reporting metrics (FR10). Deterministic over task lists. */

function inRange(d: Date, from: Date, to: Date): boolean {
  const t = startOfDay(d).getTime();
  return t >= startOfDay(from).getTime() && t <= startOfDay(to).getTime();
}

export interface CompletionStats {
  planned: number;
  completed: number;
  rate: number; // 0..1
}

export function completionRate(
  tasks: PlanTask[],
  from: Date,
  to: Date,
): CompletionStats {
  const planned = tasks.filter((t) => {
    const due = toDate(t.dueDate);
    return due !== null && inRange(due, from, to);
  });
  const completed = planned.filter((t) => t.status === "completed");
  return {
    planned: planned.length,
    completed: completed.length,
    rate: planned.length ? completed.length / planned.length : 0,
  };
}

/** Overdue + high-priority items due within 2 days. */
export function atRiskDeadlines(tasks: PlanTask[], now: Date): number {
  const soon = dueWithin(tasks, now, 2).filter(
    (t) => t.priority === "high" || t.priority === "urgent",
  );
  return overdueTasks(tasks, now).length + soon.length;
}

/** Mean (dueDate − completedAt) in days over completed, dated tasks.
 *  Positive = finished early, negative = late. null if no data. */
export function scheduleVariance(tasks: PlanTask[]): number | null {
  const done = tasks.filter(
    (t) => t.status === "completed" && t.completedAt && t.dueDate,
  );
  if (done.length === 0) return null;
  const total = done.reduce((sum, t) => {
    const due = toDate(t.dueDate)!;
    const completed = toDate(t.completedAt)!;
    return sum + daysBetween(completed, due); // due - completed
  }, 0);
  return total / done.length;
}

export interface PortfolioHealth {
  portfolio: Portfolio;
  total: number;
  completed: number;
  pct: number; // 0..100
}

export function portfolioHealth(tasks: PlanTask[]): PortfolioHealth[] {
  const portfolios: Portfolio[] = ["office", "personal_dev", "personal_life"];
  return portfolios.map((p) => {
    const rows = tasks.filter((t) => t.portfolio === p);
    const completed = rows.filter((t) => t.status === "completed").length;
    return {
      portfolio: p,
      total: rows.length,
      completed,
      pct: rows.length ? Math.round((completed / rows.length) * 100) : 0,
    };
  });
}
