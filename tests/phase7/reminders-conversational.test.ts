import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, OWNER_A } from "../helpers/db";
import { routeIntent } from "@/lib/orchestrator/router";
import { act } from "@/lib/orchestrator/act";
import { parseReminder } from "@/lib/reminders/parse";
import { listReminderRules } from "@/lib/db/repo/reminders";
import { listTasks } from "@/lib/db/repo/tasks";

/**
 * Increment A — conversational reminders (FR6, FR38). The chat path now creates
 * real reminder rules (fired by cron/fire-reminders, quiet-hours aware), not
 * just dated tasks. Deterministic/offline.
 */
const TZ = "America/New_York";
const NOW = new Date("2026-09-01T12:00:00Z"); // 08:00 EDT, Mon 1 Sep 2026

describe("[P8] parseReminder", () => {
  it("parses recurring interval reminders", () => {
    const p = parseReminder("remind me to stretch every 2 hours", NOW, TZ)!;
    expect(p.schedule).toBe("every_n_hours");
    expect(p.scheduleConfig).toEqual({ hours: 2 });
    expect(p.recurring).toBe(true);
    expect(p.nextFire.getTime()).toBe(NOW.getTime() + 2 * 3_600_000);
    expect(p.subject.toLowerCase()).toContain("stretch");
  });

  it("parses a daily reminder at an explicit time", () => {
    const p = parseReminder("remind me every morning at 7 AM to review my plan", NOW, TZ)!;
    expect(p.schedule).toBe("daily");
    expect(p.recurring).toBe(true);
    // 7am EDT is after 08:00 already passed → next occurrence is tomorrow 07:00.
    expect(p.nextFire.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("parses a one-off timed reminder", () => {
    const p = parseReminder("remind me to call the plumber at 9pm", NOW, TZ)!;
    expect(p.schedule).toBe("one_off");
    expect(p.recurring).toBe(false);
  });

  it("returns null when no schedulable time is present", () => {
    expect(parseReminder("remind me to review the deck", NOW, TZ)).toBeNull();
  });
});

describe("[P8] conversational reminders", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await closeDb();
  });

  it("routes reminder phrasing to the reminder intent", async () => {
    expect((await routeIntent("remind me to stretch every 2 hours")).intent).toBe("reminder");
    expect((await routeIntent("remind me about the workbook tomorrow at 8am")).intent).toBe("reminder");
    expect((await routeIntent("remind me every morning at 7 to review my plan")).intent).toBe("reminder");
  });

  it("creates an interval reminder rule (no task) for a recurring nudge", async () => {
    const r = await act(OWNER_A, "reminder", "remind me to stretch every 2 hours", TZ);
    expect(r.actions.some((a) => a.type === "reminder")).toBe(true);
    const rules = await listReminderRules(OWNER_A);
    expect(rules).toHaveLength(1);
    expect(rules[0].schedule).toBe("every_n_hours");
    expect(rules[0].scheduleConfig).toEqual({ hours: 2 });
    // A recurring nudge is not a ledger task.
    expect(await listTasks(OWNER_A)).toHaveLength(0);
  });

  it("files the task AND a one-off reminder for a timed nudge", async () => {
    await resetDb();
    const r = await act(OWNER_A, "reminder", "remind me to call the plumber at 9pm", TZ);
    // Both a calendar/task card and a reminder card.
    expect(r.actions.some((a) => a.type === "calendar")).toBe(true);
    expect(r.actions.some((a) => a.type === "reminder")).toBe(true);

    expect(await listTasks(OWNER_A)).toHaveLength(1);

    const rules = await listReminderRules(OWNER_A);
    expect(rules).toHaveLength(1);
    expect(rules[0].schedule).toBe("one_off");
    // Quiet-hours deferral of the fire time is verified deterministically in
    // tests/phase2/quiet-hours.test.ts (server-local-time dependent here).
  });

  it("falls back to task capture when no time is given", async () => {
    await resetDb();
    const r = await act(OWNER_A, "reminder", "remind me to review the deck", TZ);
    expect(r.actions.some((a) => a.type === "task_created")).toBe(true);
    expect(await listReminderRules(OWNER_A)).toHaveLength(0);
    expect(await listTasks(OWNER_A)).toHaveLength(1);
  });
});
