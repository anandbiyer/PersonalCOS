import { describe, it, expect } from "vitest";
import { projectDay, projectWeek } from "@/lib/planner/calendar";
import type { PlanTask } from "@/lib/planner/types";

const MON = new Date(2026, 5, 15, 9, 0); // Monday
const SAT = new Date(2026, 5, 20, 9, 0); // Saturday

describe("[P2] calendar projection (FR28)", () => {
  it("projects the weekday template (T-FR28-01)", () => {
    const day = projectDay(MON);
    const titles = day.items.filter((i) => i.kind === "block").map((i) => i.title);
    expect(titles).toContain("Office");
    expect(titles).toContain("Study (deep focus)");
  });

  it("uses the weekend template on weekends (T-FR28-02)", () => {
    const day = projectDay(SAT);
    const titles = day.items.map((i) => i.title);
    expect(titles).toContain("Badminton");
    expect(titles).not.toContain("Office");
  });

  it("places a dated task on its day (T-FR28-03)", () => {
    const task: PlanTask = {
      id: "t1",
      name: "Client F walkthrough",
      portfolio: "office",
      status: "planned",
      dueDate: new Date(2026, 5, 15, 14, 0),
    };
    const day = projectDay(MON, { tasks: [task] });
    const found = day.items.find((i) => i.kind === "task");
    expect(found?.title).toBe("Client F walkthrough");
    expect(found?.start).toBe("14:00");
    // Assumed default block length gives it an end → renders as a range.
    expect(found?.end).toBe("14:30");
  });

  it("uses a task's stated duration for the block end (T-FR28-05)", () => {
    const task: PlanTask = {
      id: "t2",
      name: "Focus sprint",
      portfolio: "personal_dev",
      status: "planned",
      dueDate: new Date(2026, 5, 15, 14, 0),
      effortMin: 90,
    };
    const found = projectDay(MON, { tasks: [task] }).items.find((i) => i.kind === "task");
    expect(found?.start).toBe("14:00");
    expect(found?.end).toBe("15:30");
  });

  it("applies a schedule exception overriding a block (T-FR4-01)", () => {
    const day = projectDay(MON, {
      exceptions: [
        { id: "e1", date: MON, overriddenBlock: "Office", replacement: "Offsite — Client M" },
      ],
    });
    const offsite = day.items.find((i) => i.title === "Offsite — Client M");
    expect(offsite?.kind).toBe("exception");
    expect(day.items.find((i) => i.title === "Office")).toBeUndefined();
  });

  it("projects a full 7-day week (T-FR28-04)", () => {
    const week = projectWeek(MON);
    expect(week).toHaveLength(7);
  });
});
