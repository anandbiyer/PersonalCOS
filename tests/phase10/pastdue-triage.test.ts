import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, OWNER_A } from "../helpers/db";
import { overdueTriageItems } from "@/lib/planner/overdue";
import { createTask, listTasks, applyTriage } from "@/lib/db/repo/tasks";
import { act } from "@/lib/orchestrator/act";
import { listReminderRules } from "@/lib/db/repo/reminders";

/** FR55 — past-due triage: the overdue-set builder + the Done/Reschedule/Drop
 *  batch apply. Builder is pure; apply is DB-backed. */
const DAY = 86_400_000;
const NOW = new Date("2026-07-04T12:00:00Z");
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);
const ahead = (d: number) => new Date(NOW.getTime() + d * DAY);

function row(over: Record<string, unknown>) {
  return { portfolio: "personal_life", status: "planned", effortMin: null, ...over } as never;
}

describe("[P10] overdueTriageItems (pure)", () => {
  it("keeps only actionable overdue tasks, oldest-due first", () => {
    const tasks = [
      row({ id: "a", name: "A (2d)", dueDate: ago(2) }),
      row({ id: "b", name: "B (5d, oldest)", dueDate: ago(5) }),
      row({ id: "done", name: "done", status: "completed", dueDate: ago(3) }),
      row({ id: "cancelled", name: "cancelled", status: "cancelled", dueDate: ago(3) }),
      row({ id: "archived", name: "archived", dueDate: ago(3), archivedAt: ago(1) }),
      row({ id: "today", name: "due today", dueDate: NOW }),
      row({ id: "future", name: "future", dueDate: ahead(3) }),
      row({ id: "undated", name: "undated", dueDate: null }),
    ];
    const { items, overflow } = overdueTriageItems(tasks, NOW);
    expect(items.map((i) => i.id)).toEqual(["b", "a"]); // oldest first, only the two overdue
    expect(overflow).toBe(0);
  });

  it("caps the list and reports the overflow", () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      row({ id: `t${i}`, name: `t${i}`, dueDate: ago(i + 1) }),
    );
    const { items, overflow } = overdueTriageItems(tasks, NOW, { cap: 7 });
    expect(items).toHaveLength(7);
    expect(overflow).toBe(3);
  });
});

describe("[P10] applyTriage (DB)", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await closeDb();
  });

  it("applies Done / Reschedule / Drop in one batch", async () => {
    await resetDb();
    const t1 = await createTask(OWNER_A, { name: "pay invoice", portfolio: "office", dueDate: ago(2) });
    const t2 = await createTask(OWNER_A, { name: "call vendor", portfolio: "office", dueDate: ago(3) });
    const t3 = await createTask(OWNER_A, { name: "old idea", portfolio: "personal_dev", dueDate: ago(4) });
    const when = ahead(4);

    const results = await applyTriage(OWNER_A, [
      { id: t1.id, action: "done" },
      { id: t2.id, action: "reschedule", dueDate: when },
      { id: t3.id, action: "drop" },
    ]);
    expect(results.every((r) => r.ok)).toBe(true);

    const byId = new Map((await listTasks(OWNER_A)).map((t) => [t.id, t]));
    expect(byId.get(t1.id)!.status).toBe("completed");
    // Re-dated to the future → status stays planned, and the future date takes
    // it out of the overdue set.
    expect(byId.get(t2.id)!.status).toBe("planned");
    expect(new Date(byId.get(t2.id)!.dueDate!).toISOString()).toBe(when.toISOString());
    expect(byId.get(t3.id)!.status).toBe("cancelled");
  });

  it("rejects a past-dated reschedule and an unknown id, without aborting the batch", async () => {
    await resetDb();
    const t = await createTask(OWNER_A, { name: "keep me", portfolio: "office", dueDate: ago(2) });
    const results = await applyTriage(OWNER_A, [
      { id: t.id, action: "reschedule", dueDate: ago(1) }, // past → rejected
      { id: "00000000-0000-0000-0000-0000000000ff", action: "done" }, // not owned → ok:false
    ]);
    expect(results[0].ok).toBe(false);
    expect(results[1].ok).toBe(false);
    // The task is untouched by the failed reschedule.
    expect((await listTasks(OWNER_A))[0].status).toBe("planned");
  });

  it("dropping a monthly reminder instance cancels the instance but keeps the series", async () => {
    await resetDb();
    await act(OWNER_A, "reminder", "rent on the last day of every month, set a reminder", "America/New_York");
    const [rule] = await listReminderRules(OWNER_A);
    const [instance] = await listTasks(OWNER_A);

    await applyTriage(OWNER_A, [{ id: instance.id, action: "drop" }]);

    expect((await listTasks(OWNER_A))[0].status).toBe("cancelled");
    expect((await listReminderRules(OWNER_A))[0].active).toBe(true); // series survives
  });
});
