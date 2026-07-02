import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, OWNER_A } from "../helpers/db";
import { act } from "@/lib/orchestrator/act";
import { listReminderRules } from "@/lib/db/repo/reminders";
import { listTasks, setTaskStatus, deleteTask } from "@/lib/db/repo/tasks";
import { materializeMonthlyNextInstance, closeAdmin } from "@/lib/db/admin";
import { computeNextFire } from "@/lib/reminders/schedule";

/**
 * FR49 — reminders are calendar-pinned tasks. Every reminder with a concrete
 * calendar instant (one_off + monthly) materializes a dated task linked to its
 * generator rule; ambient nudges (interval/daily) stay task-less. Deterministic.
 */
const TZ = "America/New_York";

/** Wall-clock HH:MM of an instant in TZ. */
function localTime(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}
/** True when `d` is the last day of its month (adding a day crosses months). */
function isLastDayOfMonth(d: Date): boolean {
  const m = (x: Date) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "numeric" }).format(x);
  return m(d) !== m(new Date(d.getTime() + 24 * 3_600_000));
}

describe("[P8] FR49 — reminders on the calendar", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await closeAdmin();
    await closeDb();
  });

  it("monthly reminder → a linked, dated task on the last day at 20:30 + a monthly rule", async () => {
    await resetDb();
    const r = await act(OWNER_A, "reminder", "Rent payment due on last day of every month. Please set a reminder.", TZ);
    expect(r.actions.some((a) => a.type === "calendar")).toBe(true);
    expect(r.actions.some((a) => a.type === "reminder")).toBe(true);

    const rules = await listReminderRules(OWNER_A);
    expect(rules).toHaveLength(1);
    expect(rules[0].schedule).toBe("monthly");
    expect(rules[0].scheduleConfig).toEqual({ day: "last", tz: TZ });

    const tasks = await listTasks(OWNER_A);
    expect(tasks).toHaveLength(1);
    const task = tasks[0];
    expect(task.reminderRuleId).toBe(rules[0].id); // linked
    expect(task.dueDate).toBeTruthy();
    expect(localTime(task.dueDate!)).toBe("20:30"); // agrees with the reminder default
    expect(isLastDayOfMonth(task.dueDate!)).toBe(true);
    expect(task.name).toBe("Rent payment"); // reminder framing/date stripped
  });

  it("one-off reminder → a linked task + a one_off rule", async () => {
    await resetDb();
    const r = await act(OWNER_A, "reminder", "remind me to call the plumber at 9pm", TZ);
    expect(r.actions.some((a) => a.type === "calendar")).toBe(true);
    expect(r.actions.some((a) => a.type === "reminder")).toBe(true);

    const rules = await listReminderRules(OWNER_A);
    expect(rules).toHaveLength(1);
    expect(rules[0].schedule).toBe("one_off");

    const tasks = await listTasks(OWNER_A);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].reminderRuleId).toBe(rules[0].id);
  });

  it("interval nudge → a rule only, still NO calendar task (unchanged)", async () => {
    await resetDb();
    await act(OWNER_A, "reminder", "remind me to stretch every 2 hours", TZ);
    expect(await listTasks(OWNER_A)).toHaveLength(0);
    expect(await listReminderRules(OWNER_A)).toHaveLength(1);
  });

  it("undo (delete the task) tears down the linked rule — no orphan keeps firing", async () => {
    await resetDb();
    await act(OWNER_A, "reminder", "remind me to renew the passport in a fortnight", TZ);
    const [task] = await listTasks(OWNER_A);
    expect((await listReminderRules(OWNER_A))).toHaveLength(1);
    await deleteTask(OWNER_A, task.id);
    expect(await listTasks(OWNER_A)).toHaveLength(0);
    expect(await listReminderRules(OWNER_A)).toHaveLength(0);
  });

  it("completing a one-off instance deactivates its rule; a monthly series survives", async () => {
    // one-off → rule deactivated on completion
    await resetDb();
    await act(OWNER_A, "reminder", "remind me to submit the form in a fortnight", TZ);
    let [task] = await listTasks(OWNER_A);
    await setTaskStatus(OWNER_A, task.id, "completed");
    expect((await listReminderRules(OWNER_A))[0].active).toBe(false);

    // monthly → series stays active when one instance is completed (decision #8)
    await resetDb();
    await act(OWNER_A, "reminder", "rent on the last day of every month, set a reminder", TZ);
    [task] = await listTasks(OWNER_A);
    await setTaskStatus(OWNER_A, task.id, "completed");
    expect((await listReminderRules(OWNER_A))[0].active).toBe(true);
  });

  it("cron roll-forward materializes the next monthly instance (idempotently)", async () => {
    await resetDb();
    await act(OWNER_A, "reminder", "rent on the last day of every month, set a reminder", TZ);
    const [rule] = await listReminderRules(OWNER_A);
    const [first] = await listTasks(OWNER_A);

    const next = computeNextFire("monthly", rule.scheduleConfig, first.dueDate!)!;
    await materializeMonthlyNextInstance(rule.id, next);

    let tasks = await listTasks(OWNER_A);
    expect(tasks).toHaveLength(2); // original + next instance
    const nextTask = tasks.find((t) => t.id !== first.id)!;
    expect(nextTask.reminderRuleId).toBe(rule.id);
    expect(nextTask.portfolio).toBe(first.portfolio); // classification copied forward
    expect(localTime(nextTask.dueDate!)).toBe("20:30");
    expect(isLastDayOfMonth(nextTask.dueDate!)).toBe(true);

    // Idempotent: a cron retry for the same rule+due does not duplicate.
    await materializeMonthlyNextInstance(rule.id, next);
    tasks = await listTasks(OWNER_A);
    expect(tasks).toHaveLength(2);
  });
});
