import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { app, asOwner, resetDb, closeDb, OWNER_A } from "../helpers/db";
import { proposePlan, commitPlan } from "@/lib/orchestrator/plan";
import { createTask, listTasks } from "@/lib/db/repo/tasks";
import { getPlan } from "@/lib/db/repo/plans";

/**
 * Phase 7 (conversational upgrade) — plan negotiation (FR45).
 * Propose computes moves into a `plans` proposal WITHOUT touching the calendar;
 * only commit writes due-dates + reminders and flips the plan to agreed.
 */
describe("[P7] plan negotiation (propose → commit)", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await closeDb();
  });

  it("propose writes a proposal but does not move tasks; commit applies + sets reminders", async () => {
    // Two unscheduled open tasks → the replan engine will place them.
    const t1 = await createTask(OWNER_A, { name: "Draft the board deck", portfolio: "office", source: "text" });
    const t2 = await createTask(OWNER_A, { name: "CCA-F domain 1", portfolio: "personal_dev", source: "text" });

    const plan = await proposePlan(OWNER_A);
    expect(plan).not.toBeNull();
    expect(plan!.items.length).toBeGreaterThan(0);
    expect(plan!.state).toBe("revised");

    // Proposal is persisted, but the calendar is untouched (still no due dates).
    const beforeCommit = await listTasks(OWNER_A);
    expect(beforeCommit.find((x) => x.id === t1.id)?.dueDate).toBeNull();
    expect(beforeCommit.find((x) => x.id === t2.id)?.dueDate).toBeNull();

    const result = await commitPlan(OWNER_A, plan!.id);
    expect(result).not.toBeNull();
    expect(result!.applied).toBe(plan!.items.length);
    expect(result!.reminders).toBe(plan!.items.length);

    // Now the calendar reflects the agreed plan.
    const afterCommit = await listTasks(OWNER_A);
    const moved = plan!.items.map((i) => i.id);
    for (const id of moved) {
      expect(afterCommit.find((x) => x.id === id)?.dueDate).not.toBeNull();
    }

    // Plan is flagged agreed; reminder rules exist.
    const stored = await getPlan(OWNER_A, plan!.id);
    expect(stored?.state).toBe("agreed");
    const rules = await asOwner(OWNER_A, (sql) => sql`SELECT count(*)::int AS c FROM reminder_rules`);
    expect((rules[0] as { c: number }).c).toBe(plan!.items.length);
  });

  it("commit is idempotent (no double-apply)", async () => {
    await createTask(OWNER_A, { name: "Pay the LIC premium", portfolio: "personal_life", source: "text" });
    const plan = await proposePlan(OWNER_A);
    expect(plan).not.toBeNull();
    expect(await commitPlan(OWNER_A, plan!.id)).not.toBeNull();
    expect(await commitPlan(OWNER_A, plan!.id)).toBeNull(); // already committed
  });
});
