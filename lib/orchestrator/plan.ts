import { listTasks, applyReplan } from "@/lib/db/repo/tasks";
import { replan, type ReplanConflict } from "@/lib/planner/replan";
import { createPlan, getPlan, agreePlan } from "@/lib/db/repo/plans";
import { createReminderRule } from "@/lib/db/repo/reminders";

/**
 * Plan negotiation (FR45): re-planning is *proposed → agreed → committed*, never
 * silent. This refines FR8 — the same capacity/dependency replan engine, but its
 * output is written to a `plans` row as a proposal and only an AGREED plan
 * touches the calendar + sets reminders.
 */
export interface PlanMove {
  id: string;
  name: string;
  fromDate: string | null; // ISO
  toDate: string; // ISO
  reason: string;
}

export interface ProposedPlan {
  id: string;
  state: string;
  items: PlanMove[];
  changeLog: string[];
  conflicts: ReplanConflict[];
}

/** Compute a re-plan and persist it as a proposal. Returns null when nothing
 *  needs to move (the day already fits). */
export async function proposePlan(ownerId: string): Promise<ProposedPlan | null> {
  const now = new Date();
  const tasks = await listTasks(ownerId);
  const result = replan(tasks, now);
  if (result.items.length === 0) return null;

  const items: PlanMove[] = result.items.map((i) => ({
    id: i.id,
    name: i.name,
    fromDate: i.fromDate ? i.fromDate.toISOString() : null,
    toDate: i.toDate.toISOString(),
    reason: i.reason,
  }));
  const changeLog = result.items.map(
    (i) => `${i.name} → ${i.toDate.toISOString().slice(0, 10)} (${i.reason})`,
  );

  const row = await createPlan(ownerId, {
    date: now.toISOString().slice(0, 10),
    state: "revised",
    items,
    changeLog,
  });
  return { id: row.id, state: row.state, items, changeLog, conflicts: result.conflicts };
}

/** Commit an agreed plan: write the moves to the calendar, set a reminder per
 *  moved item, and flag the plan agreed. Idempotent (no double-apply). */
export async function commitPlan(
  ownerId: string,
  planId: string,
): Promise<{ applied: number; reminders: number } | null> {
  const plan = await getPlan(ownerId, planId);
  if (!plan || plan.state === "agreed") return null;

  const items = (plan.itemsJson as PlanMove[]).map((i) => ({
    id: i.id,
    name: i.name,
    fromDate: i.fromDate ? new Date(i.fromDate) : null,
    toDate: new Date(i.toDate),
    reason: i.reason,
  }));

  const applied = await applyReplan(ownerId, items);
  let reminders = 0;
  for (const i of items) {
    await createReminderRule(ownerId, { target: i.id, schedule: "one_off", nextFire: i.toDate });
    reminders++;
  }
  await agreePlan(ownerId, planId);
  return { applied, reminders };
}
