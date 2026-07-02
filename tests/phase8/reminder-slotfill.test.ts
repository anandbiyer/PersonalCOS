import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, OWNER_A } from "../helpers/db";
import { act } from "@/lib/orchestrator/act";
import { tryCompletePendingReminder } from "@/lib/orchestrator/pending";
import { getPendingReminder } from "@/lib/memory/pending-reminder";
import { listReminderRules } from "@/lib/db/repo/reminders";
import { listTasks } from "@/lib/db/repo/tasks";
import { listFacts } from "@/lib/db/repo/facts";

/**
 * FR51 — reminder date slot-fill. A reminder with no derivable date is not filed
 * date-less: the COS asks for a date, remembers the subject in a transient
 * internal slot, and the next turn's answer completes it. Deterministic.
 */
const TZ = "America/New_York";

describe("[P8] FR51 — date slot-fill", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await closeDb();
  });

  it("asks for a date and files nothing when the reminder has no date", async () => {
    await resetDb();
    const r = await act(OWNER_A, "reminder", "remind me to renew the car insurance", TZ);
    expect(r.content).toMatch(/when should i remind you about "renew the car insurance"/i);
    expect(await listReminderRules(OWNER_A)).toHaveLength(0);
    expect(await listTasks(OWNER_A)).toHaveLength(0);
    // A live slot exists…
    expect(await getPendingReminder(OWNER_A)).toMatchObject({ subject: "Renew the car insurance" });
    // …but it's internal: hidden from the durable-facts listing (no leak into
    // context assembly or the Memory view).
    expect(await listFacts(OWNER_A, { activeOnly: true })).toHaveLength(0);
  });

  it("completes the reminder from the next turn's date (one-off), with a clean name", async () => {
    await resetDb();
    await act(OWNER_A, "reminder", "remind me to renew the car insurance", TZ);
    const r = await tryCompletePendingReminder(OWNER_A, "on the 15th", TZ);
    expect(r).not.toBeNull();

    const rules = await listReminderRules(OWNER_A);
    expect(rules).toHaveLength(1);
    expect(rules[0].schedule).toBe("one_off");

    const tasks = await listTasks(OWNER_A);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].name).toBe("Renew the car insurance"); // no "the 15th" noise
    expect(tasks[0].reminderRuleId).toBe(rules[0].id);

    expect(await getPendingReminder(OWNER_A)).toBeNull(); // slot cleared
  });

  it("a recurring answer completes as a monthly reminder", async () => {
    await resetDb();
    await act(OWNER_A, "reminder", "remind me to pay the rent", TZ);
    await tryCompletePendingReminder(OWNER_A, "the last day of every month", TZ);
    const rules = await listReminderRules(OWNER_A);
    expect(rules).toHaveLength(1);
    expect(rules[0].schedule).toBe("monthly");
    expect(await listTasks(OWNER_A)).toHaveLength(1);
  });

  it("'never mind' cancels the pending reminder", async () => {
    await resetDb();
    await act(OWNER_A, "reminder", "remind me to book the dentist", TZ);
    const r = await tryCompletePendingReminder(OWNER_A, "never mind", TZ);
    expect(r?.content).toMatch(/won'?t set a reminder/i);
    expect(await listReminderRules(OWNER_A)).toHaveLength(0);
    expect(await listTasks(OWNER_A)).toHaveLength(0);
    expect(await getPendingReminder(OWNER_A)).toBeNull();
  });

  it("a non-date reply drops the slot and defers to normal routing", async () => {
    await resetDb();
    await act(OWNER_A, "reminder", "remind me to email the accountant", TZ);
    const r = await tryCompletePendingReminder(OWNER_A, "actually let's talk about something else", TZ);
    expect(r).toBeNull(); // caller routes this message normally
    expect(await getPendingReminder(OWNER_A)).toBeNull(); // slot dropped
    expect(await listReminderRules(OWNER_A)).toHaveLength(0);
  });

  it("returns null when there is no pending slot", async () => {
    await resetDb();
    expect(await tryCompletePendingReminder(OWNER_A, "the 15th", TZ)).toBeNull();
  });

  it("an unfilled slot lapses after its TTL", async () => {
    await resetDb();
    await act(OWNER_A, "reminder", "remind me to renew the passport", TZ);
    const later = new Date(Date.now() + 16 * 60 * 1000); // > 15-min TTL
    expect(await getPendingReminder(OWNER_A, later)).toBeNull();
  });
});
