import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, asOwner, OWNER_A, OWNER_B } from "../helpers/db";
import { client } from "@/lib/db";
import { createTask, listTasks, replanOverdue } from "@/lib/db/repo/tasks";
import { startOfDay } from "@/lib/planner/dates";

/** Phase 4 — replan apply path (FR8), RLS-scoped + audited. */
describe("[P4] replan apply", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await client.end({ timeout: 5 });
    await closeDb();
  });

  it("moves an overdue task forward, sets Replanned, and audits it (T-FR8-06)", async () => {
    await createTask(OWNER_A, {
      name: "Slipped deliverable",
      portfolio: "office",
      dueDate: new Date(2026, 0, 1), // long overdue
    });

    const result = await replanOverdue(OWNER_A, { apply: true });
    expect(result.applied).toBeGreaterThanOrEqual(1);

    const [t] = await listTasks(OWNER_A);
    expect(t.status).toBe("replanned");
    expect(startOfDay(new Date(t.dueDate!)).getTime()).toBeGreaterThan(startOfDay(new Date()).getTime());

    const audits = await asOwner(
      OWNER_A,
      (sql) => sql`SELECT count(*)::int AS c FROM audit WHERE change_type = 'task.replanned'`,
    );
    expect(audits[0].c).toBeGreaterThanOrEqual(1);
  });

  it("does not touch another tenant's tasks (T-FR8-07)", async () => {
    expect(await listTasks(OWNER_B)).toHaveLength(0);
  });
});
