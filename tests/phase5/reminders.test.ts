import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, OWNER_A, OWNER_B } from "../helpers/db";
import { client } from "@/lib/db";
import { closeAdmin, listDueReminderRules, markReminderFired } from "@/lib/db/admin";
import { computeNextFire } from "@/lib/reminders/schedule";
import { createReminderRule, listReminderRules } from "@/lib/db/repo/reminders";

/** Phase 5 — scheduled/interval reminders (FR38, Scenario M). */
describe("[P5] interval reminders", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await client.end({ timeout: 5 });
    await closeAdmin();
    await closeDb();
  });

  it("computes the next fire time per schedule (T-FR38-02)", () => {
    const now = new Date(2026, 5, 15, 9, 0);
    expect(computeNextFire("daily", null, now)!.getTime()).toBe(now.getTime() + 86_400_000);
    expect(computeNextFire("every_n_hours", { hours: 3 }, now)!.getTime()).toBe(now.getTime() + 3 * 3_600_000);
    expect(computeNextFire("one_off", null, now)).toBeNull();
  });

  it("a due rule is enumerated for its owner, then advances past 'now' (T-FR38-03)", async () => {
    const rule = await createReminderRule(OWNER_A, {
      target: "Take meds",
      schedule: "daily",
      nextFire: new Date(Date.now() - 60_000), // due
    });

    const due = await listDueReminderRules(new Date());
    const mine = due.find((d) => d.id === rule.id);
    expect(mine?.ownerId).toBe(OWNER_A);

    await markReminderFired(rule.id, computeNextFire("daily", null, new Date()));
    const due2 = await listDueReminderRules(new Date());
    expect(due2.map((d) => d.id)).not.toContain(rule.id);
  });

  it("rules are RLS-scoped to their owner (T-FR38-04)", async () => {
    expect(await listReminderRules(OWNER_B)).toHaveLength(0);
  });
});
