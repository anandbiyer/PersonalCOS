import { describe, it, expect } from "vitest";
import { composeBrief } from "@/lib/brief/compose";
import { projectDay } from "@/lib/planner/calendar";
import { categorizeWaiting, dueToday, overdueTasks } from "@/lib/planner/reminders";
import type { PlanTask } from "@/lib/planner/types";

const NOW = new Date(2026, 5, 15, 6, 0);
const tasks: PlanTask[] = [
  { id: "1", name: "LIC premium", portfolio: "personal_life", status: "planned", dueDate: new Date(2026, 5, 9) },
  { id: "2", name: "Board deck", portfolio: "office", status: "planned", dueDate: new Date(2026, 5, 15) },
  { id: "3", name: "Pilot scope", portfolio: "office", status: "waiting", updatedAt: new Date(2026, 5, 11) },
];

function build(mode: "am" | "pm") {
  return composeBrief(mode, {
    now: NOW,
    name: "Anand",
    dayPlan: projectDay(NOW, { tasks }),
    overdue: overdueTasks(tasks, NOW),
    dueToday: dueToday(tasks, NOW),
    waiting: categorizeWaiting(tasks, NOW),
  });
}

describe("[P2] daily brief artifact (FR25)", () => {
  it("morning brief summarises plan + glance counts (T-FR25-01)", () => {
    const b = build("am");
    expect(b.greeting).toContain("Good morning");
    expect(b.glance.overdue).toBe(1); // LIC overdue
    expect(b.glance.tasksToday).toBe(1); // board deck
    expect(b.glance.waitingOn).toBe(1); // pilot scope
    expect(b.focus.some((f) => f.tone === "overdue")).toBe(true);
  });

  it("evening brief is a completeness sweep (T-FR25-02)", () => {
    const b = build("pm");
    expect(b.prose.toLowerCase()).toContain("evening sweep");
    expect(b.prose.toLowerCase()).toContain("waiting on");
  });
});
