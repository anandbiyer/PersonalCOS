import { describe, it, expect } from "vitest";
import { projectDay, projectWeek } from "@/lib/planner/calendar";
import { overdueTasks } from "@/lib/planner/reminders";
import type { PlanEvent, PlanTask } from "@/lib/planner/types";

const NOW = new Date(2026, 5, 15, 10, 0);

describe("[P2] scenario traceability", () => {
  it("Scenario A — renewal overdue is tracked (never auto-paid) (T-SCEN-A)", () => {
    const lic: PlanTask = {
      id: "lic",
      name: "LIC premium renewal",
      portfolio: "personal_life",
      status: "planned",
      dueDate: new Date(2026, 5, 9),
    };
    const over = overdueTasks([lic], NOW);
    expect(over).toHaveLength(1);
    // Status stays open — the agent reminds/tracks, it does not resolve/pay.
    expect(over[0].status).toBe("planned");
  });

  it("Scenario B — a booked trip appears on the calendar (T-SCEN-B)", () => {
    const trip: PlanEvent = { id: "goa", date: new Date(2026, 5, 15, 6, 30), type: "Goa flight" };
    const day = projectDay(NOW, { events: [trip] });
    expect(day.items.some((i) => i.kind === "event" && i.title === "Goa flight")).toBe(true);
  });

  it("Scenario H — multi-step vacation planning spans the week (T-SCEN-H)", () => {
    const steps: PlanTask[] = [
      { id: "v1", name: "Compare Goa flights", portfolio: "personal_life", status: "planned", dueDate: new Date(2026, 5, 16) },
      { id: "v2", name: "Book hotel", portfolio: "personal_life", status: "planned", dueDate: new Date(2026, 5, 18) },
    ];
    const week = projectWeek(NOW, { tasks: steps });
    const titles = week.flatMap((d) => d.items.map((i) => i.title));
    expect(titles).toContain("Compare Goa flights");
    expect(titles).toContain("Book hotel");
  });
});
