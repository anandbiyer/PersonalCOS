import { describe, it, expect } from "vitest";
import { replan } from "@/lib/planner/replan";
import { startOfDay } from "@/lib/planner/dates";
import type { PlanTask } from "@/lib/planner/types";

const NOW = new Date(2026, 5, 15, 10, 0); // Mon
const task = (o: Partial<PlanTask>): PlanTask => ({
  id: Math.random().toString(36).slice(2),
  name: "t",
  portfolio: "office",
  status: "planned",
  dueDate: null,
  ...o,
});

describe("[P4] automatic replanning (FR8)", () => {
  it("moves overdue tasks to a future day (T-FR8-01)", () => {
    const t = task({ name: "slipped", dueDate: new Date(2026, 5, 10) }); // overdue
    const { items } = replan([t], NOW);
    expect(items).toHaveLength(1);
    expect(startOfDay(items[0].toDate).getTime()).toBeGreaterThan(startOfDay(NOW).getTime());
  });

  it("schedules higher priority earlier under tight capacity (T-FR8-02)", () => {
    const hi = task({ id: "hi", name: "hi", priority: "high", effortMin: 30, dueDate: new Date(2026, 5, 10) });
    const lo = task({ id: "lo", name: "lo", priority: "low", effortMin: 30, dueDate: new Date(2026, 5, 10) });
    const { items } = replan([lo, hi], NOW, { capacityMin: 30 }); // one per day
    const hiDate = items.find((i) => i.id === "hi")!.toDate.getTime();
    const loDate = items.find((i) => i.id === "lo")!.toDate.getTime();
    expect(hiDate).toBeLessThan(loDate);
  });

  it("never places a task before its dependency (T-FR8-03)", () => {
    const a = task({ id: "a", name: "A", effortMin: 30, dueDate: new Date(2026, 5, 10) });
    const b = task({ id: "b", name: "B", effortMin: 30, dueDate: new Date(2026, 5, 10), dependsOn: ["a"] });
    const { items } = replan([b, a], NOW, { capacityMin: 30 });
    const aDate = items.find((i) => i.id === "a")!.toDate.getTime();
    const bDate = items.find((i) => i.id === "b")!.toDate.getTime();
    expect(bDate).toBeGreaterThanOrEqual(aDate);
    expect(items.find((i) => i.id === "b")!.reason).toBe("after dependency");
  });

  it("flags a capacity conflict when work overflows the horizon (T-FR8-04)", () => {
    // horizon 2 days, capacity 30/day -> only 2 of the 3 overdue tasks fit;
    // the third overflows and is flagged.
    const tasks = [0, 1, 2].map((n) =>
      task({ id: `f${n}`, name: `f${n}`, effortMin: 30, dueDate: new Date(2026, 5, 10) }),
    );
    const { conflicts } = replan(tasks, NOW, { capacityMin: 30, horizonDays: 2 });
    expect(conflicts.map((c) => c.id)).toContain("f2");
  });

  it("spreads load across days when a single day overflows (T-FR8-05)", () => {
    const three = [1, 2, 3].map((n) =>
      task({ id: `x${n}`, name: `x${n}`, effortMin: 30, dueDate: new Date(2026, 5, 10) }),
    );
    const { items } = replan(three, NOW, { capacityMin: 60 }); // 2 per day
    const days = new Set(items.map((i) => startOfDay(i.toDate).getTime()));
    expect(days.size).toBeGreaterThanOrEqual(2);
  });
});
