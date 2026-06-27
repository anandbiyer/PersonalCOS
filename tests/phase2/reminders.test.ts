import { describe, it, expect } from "vitest";
import {
  categorizeWaiting,
  dueToday,
  dueWithin,
  overdueTasks,
} from "@/lib/planner/reminders";
import type { PlanTask } from "@/lib/planner/types";

const NOW = new Date(2026, 5, 15, 10, 0); // Mon 10:00
const task = (over: Partial<PlanTask>): PlanTask => ({
  id: Math.random().toString(36).slice(2),
  name: "t",
  portfolio: "office",
  status: "planned",
  dueDate: null,
  ...over,
});

describe("[P2] missed-task & waiting-on (FR7, FR23)", () => {
  it("detects overdue open tasks, not completed/future (T-FR7-01)", () => {
    const tasks = [
      task({ name: "slipped", dueDate: new Date(2026, 5, 14) }),
      task({ name: "done", dueDate: new Date(2026, 5, 14), status: "completed" }),
      task({ name: "today", dueDate: new Date(2026, 5, 15) }),
    ];
    expect(overdueTasks(tasks, NOW).map((t) => t.name)).toEqual(["slipped"]);
  });

  it("finds tasks due today and within N days (T-FR7-02)", () => {
    const tasks = [
      task({ name: "today", dueDate: new Date(2026, 5, 15) }),
      task({ name: "tomorrow", dueDate: new Date(2026, 5, 16) }),
      task({ name: "next week", dueDate: new Date(2026, 5, 25) }),
    ];
    expect(dueToday(tasks, NOW).map((t) => t.name)).toEqual(["today"]);
    expect(dueWithin(tasks, NOW, 2).map((t) => t.name).sort()).toEqual([
      "today",
      "tomorrow",
    ]);
  });

  it("splits waiting-on into owed-to-you and you-owe with nudge age (T-FR23-01)", () => {
    const tasks = [
      task({ name: "pilot scope", status: "waiting", updatedAt: new Date(2026, 5, 11) }),
      task({ name: "board deck", status: "in_progress", owner: "Stakeholder M" }),
      task({ name: "no stakeholder", status: "planned" }),
    ];
    const { owedToYou, youOwe } = categorizeWaiting(tasks, NOW);
    expect(owedToYou.map((w) => w.task.name)).toEqual(["pilot scope"]);
    expect(owedToYou[0].nudgeDays).toBe(4);
    expect(youOwe.map((w) => w.task.name)).toEqual(["board deck"]);
  });
});
