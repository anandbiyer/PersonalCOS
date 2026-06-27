import { describe, it, expect } from "vitest";
import { generateStudyPlan } from "@/lib/planner/study";

/** Phase 3 — backward-planned study plan (FR9 / Scenario D). */
const now = new Date(2026, 5, 15); // Mon Jun 15
const deadline = new Date(2026, 7, 15); // Aug 15 (~2 months)
const topics = [
  { name: "Networking", weight: 2 },
  { name: "Security", weight: 1 },
  { name: "Databases", weight: 1 },
];

describe("[P3] study-plan generation (FR9)", () => {
  it("covers every topic within the window (T-FR9-01)", () => {
    const plan = generateStudyPlan({ now, deadline, topics });
    const names = new Set(plan.map((s) => s.topic));
    for (const t of topics) expect(names.has(t.name)).toBe(true);
    expect(names.has("Review & practice test")).toBe(true);
  });

  it("schedules sessions after now and before the deadline (T-FR9-02)", () => {
    const plan = generateStudyPlan({ now, deadline, topics });
    for (const s of plan) {
      expect(s.date.getTime()).toBeGreaterThan(now.getTime());
      expect(s.date.getTime()).toBeLessThanOrEqual(deadline.getTime());
    }
  });

  it("weights heavier topics with more sessions (T-FR9-03)", () => {
    const plan = generateStudyPlan({ now, deadline, topics });
    const net = plan.filter((s) => s.topic === "Networking").length;
    const sec = plan.filter((s) => s.topic === "Security").length;
    expect(net).toBeGreaterThanOrEqual(sec);
  });

  it("handles a deadline that is too close without throwing (T-FR9-04)", () => {
    const tight = generateStudyPlan({ now, deadline: new Date(2026, 5, 16), topics });
    expect(Array.isArray(tight)).toBe(true);
  });
});
