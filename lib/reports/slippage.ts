import type { Portfolio } from "@/lib/ai/types";
import { dueWithin } from "@/lib/planner/reminders";
import type { PlanTask } from "@/lib/planner/types";
import { scheduleVariance } from "./metrics";

/**
 * Slippage / deadline-risk prediction (FR24): feed historical schedule variance
 * forward. Open tasks due soon in a portfolio that historically finishes late
 * — or high-priority ones — are flagged at risk.
 */
export interface SlippageRisk {
  task: PlanTask;
  reason: string;
}

export function predictSlippage(tasks: PlanTask[], now: Date, horizonDays = 3): SlippageRisk[] {
  const portfolios: Portfolio[] = ["office", "personal_dev", "personal_life"];
  const variance = new Map<Portfolio, number | null>();
  for (const p of portfolios) {
    variance.set(p, scheduleVariance(tasks.filter((t) => t.portfolio === p)));
  }

  return dueWithin(tasks, now, horizonDays)
    .map((t) => {
      const v = variance.get(t.portfolio as Portfolio);
      if (v !== null && v !== undefined && v < 0) {
        return { task: t, reason: `history runs ~${Math.abs(v).toFixed(1)}d late in ${t.portfolio}` };
      }
      if (t.priority === "high" || t.priority === "urgent") {
        return { task: t, reason: "high priority, due soon" };
      }
      return null;
    })
    .filter((r): r is SlippageRisk => r !== null);
}
