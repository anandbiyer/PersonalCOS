import { describe, it, expect } from "vitest";
import { predictSlippage } from "@/lib/reports/slippage";
import { detectOverload } from "@/lib/planner/overload";
import { heuristicExtract } from "@/lib/judgment/notes";
import { calibrateEstimate } from "@/lib/judgment/learning";
import type { PlanTask } from "@/lib/planner/types";

const NOW = new Date(2026, 5, 15, 10, 0);
const task = (o: Partial<PlanTask>): PlanTask => ({
  id: Math.random().toString(36).slice(2),
  name: "t",
  portfolio: "office",
  status: "planned",
  dueDate: null,
  ...o,
});

describe("[P4] slippage prediction (FR24)", () => {
  it("flags due-soon tasks in a historically-late portfolio + high priority (T-FR24-01 / Scenario C)", () => {
    const tasks = [
      // office history runs 3 days late
      task({ portfolio: "office", status: "completed", dueDate: new Date(2026, 5, 10), completedAt: new Date(2026, 5, 13) }),
      task({ name: "office soon", portfolio: "office", dueDate: new Date(2026, 5, 16) }),
      task({ name: "dev urgent", portfolio: "personal_dev", priority: "high", dueDate: new Date(2026, 5, 16) }),
      task({ name: "life calm", portfolio: "personal_life", dueDate: new Date(2026, 5, 16) }),
    ];
    const names = predictSlippage(tasks, NOW).map((s) => s.task.name);
    expect(names).toContain("office soon");
    expect(names).toContain("dev urgent");
    expect(names).not.toContain("life calm");
  });
});

describe("[P4] overload detection (FR22)", () => {
  it("flags an over-capacity day and suggests the lowest-priority drop (T-FR22-01)", () => {
    const tasks = [
      task({ name: "big high", priority: "high", effortMin: 90, dueDate: new Date(2026, 5, 16) }),
      task({ name: "big low", priority: "low", effortMin: 90, dueDate: new Date(2026, 5, 16) }),
    ];
    const days = detectOverload(tasks, NOW, { capacityMin: 120 });
    expect(days.length).toBe(1);
    expect(days[0].totalMin).toBe(180);
    expect(days[0].suggestDrop?.name).toBe("big low");
  });
});

describe("[P4] notes-to-action (FR18)", () => {
  it("categorises lines into actions/decisions/questions/waiting-ons (T-FR18-01)", () => {
    const x = heuristicExtract(
      "Email the board deck\nDecided to use vendor X\nWhat about the budget?\nWaiting on data from Client F SME",
    );
    expect(x.actions).toContain("Email the board deck");
    expect(x.decisions.some((d) => d.startsWith("Decided"))).toBe(true);
    expect(x.questions.some((q) => q.endsWith("?"))).toBe(true);
    expect(x.waitingOns.some((w) => /Waiting/.test(w))).toBe(true);
  });
});

describe("[P4] estimation learning (FR27)", () => {
  it("scales a base estimate by historical actual/estimated ratio (T-FR27-01)", () => {
    expect(calibrateEstimate([{ estimatedMin: 60, actualMin: 90 }], 60)).toBe(90);
    expect(calibrateEstimate([], 45)).toBe(45);
  });
});
