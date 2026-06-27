import { describe, it, expect } from "vitest";
import {
  atRiskDeadlines,
  completionRate,
  portfolioHealth,
  scheduleVariance,
} from "@/lib/reports/metrics";
import type { PlanTask } from "@/lib/planner/types";

const NOW = new Date(2026, 5, 15, 10, 0);
const task = (over: Partial<PlanTask>): PlanTask => ({
  id: Math.random().toString(36).slice(2),
  name: "t",
  portfolio: "office",
  status: "planned",
  dueDate: null,
  ...over,
});

describe("[P2] reporting metrics (FR10)", () => {
  it("computes weekly completion rate (T-FR10-01)", () => {
    const weekStart = new Date(2026, 5, 15);
    const weekEnd = new Date(2026, 5, 21);
    const tasks = [
      task({ dueDate: new Date(2026, 5, 16), status: "completed" }),
      task({ dueDate: new Date(2026, 5, 17), status: "completed" }),
      task({ dueDate: new Date(2026, 5, 18), status: "planned" }),
    ];
    const c = completionRate(tasks, weekStart, weekEnd);
    expect(c.planned).toBe(3);
    expect(c.completed).toBe(2);
    expect(c.rate).toBeCloseTo(2 / 3);
  });

  it("counts at-risk deadlines (overdue + high-pri soon) (T-FR10-02)", () => {
    const tasks = [
      task({ dueDate: new Date(2026, 5, 14) }), // overdue
      task({ dueDate: new Date(2026, 5, 16), priority: "high" }), // soon high
      task({ dueDate: new Date(2026, 5, 16), priority: "low" }), // soon low (ignored)
    ];
    expect(atRiskDeadlines(tasks, NOW)).toBe(2);
  });

  it("computes schedule variance (positive = early) (T-FR10-03 / Scenario C)", () => {
    const tasks = [
      task({
        status: "completed",
        dueDate: new Date(2026, 5, 15),
        completedAt: new Date(2026, 5, 13),
      }), // 2 days early
    ];
    expect(scheduleVariance(tasks)).toBe(2);
    expect(scheduleVariance([])).toBeNull();
  });

  it("computes per-portfolio health (T-FR10-04)", () => {
    const tasks = [
      task({ portfolio: "office", status: "completed" }),
      task({ portfolio: "office", status: "planned" }),
      task({ portfolio: "personal_life", status: "completed" }),
    ];
    const health = portfolioHealth(tasks);
    expect(health.find((h) => h.portfolio === "office")?.pct).toBe(50);
    expect(health.find((h) => h.portfolio === "personal_life")?.pct).toBe(100);
    expect(health.find((h) => h.portfolio === "personal_dev")?.pct).toBe(0);
  });
});
