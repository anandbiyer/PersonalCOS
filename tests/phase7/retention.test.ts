import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, asOwner, OWNER_A } from "../helpers/db";
import { runRetention } from "@/lib/memory/retention";
import { appendTurn, lastTurns } from "@/lib/db/repo/turns";
import { addFact, listFacts } from "@/lib/db/repo/facts";
import { saveDaySummary, listDaySummaries } from "@/lib/db/repo/summaries";
import { createTask, setTaskStatus } from "@/lib/db/repo/tasks";

/**
 * Phase 7 — tiered retention (FR47 §4.6.1). The verbatim tier ages out or is
 * completion-pruned; the durable tiers (facts, day-summaries, ledger) are never
 * touched by a normal sweep (NFR-5).
 */
describe("[P7] retention sweep", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await closeDb();
  });

  it("prunes completion-flagged turns, keeps in-window unrelated turns", async () => {
    const task = await createTask(OWNER_A, { name: "File taxes", portfolio: "office" });
    // A turn about that task, and an unrelated recent turn.
    const about = await appendTurn(OWNER_A, { role: "user", text: "did the taxes", refsTaskId: task.id });
    await appendTurn(OWNER_A, { role: "cos", text: "noted — anything else?" });

    // Completing the task flags its turns prune_eligible (memory boundary).
    await setTaskStatus(OWNER_A, task.id, "completed");

    const res = await runRetention(OWNER_A, new Date());
    expect(res.turnsDeleted).toBe(1);

    const remaining = await lastTurns(OWNER_A, 10);
    expect(remaining.some((t) => t.id === about.id)).toBe(false); // pruned
    expect(remaining.some((t) => t.text === "noted — anything else?")).toBe(true); // kept
  });

  it("deletes verbatim turns older than the retention window", async () => {
    await resetDb();
    const fresh = await appendTurn(OWNER_A, { role: "user", text: "today's note" });
    // Backdate a turn 30 days into the past (default window is 7 days).
    await asOwner(OWNER_A, async (sql) => {
      await sql`insert into conversation_turns (owner_id, role, text, created_at)
                values (${OWNER_A}, 'user', 'ancient note', now() - interval '30 days')`;
    });

    const res = await runRetention(OWNER_A, new Date());
    expect(res.turnsDeleted).toBe(1);

    const remaining = await lastTurns(OWNER_A, 10);
    expect(remaining.some((t) => t.id === fresh.id)).toBe(true);
    expect(remaining.some((t) => t.text === "ancient note")).toBe(false);
  });

  it("never touches durable facts or day-summaries (NFR-5)", async () => {
    await resetDb();
    await addFact(OWNER_A, { kind: "preference", value: "Prefers 9pm reminders" });
    await saveDaySummary(OWNER_A, { date: "2026-06-01", summaryText: "Shipped the migration." });

    const res = await runRetention(OWNER_A, new Date());
    expect(res.summariesRolledOff).toBe(0);

    expect((await listFacts(OWNER_A, { activeOnly: true })).length).toBe(1);
    expect((await listDaySummaries(OWNER_A, 5)).length).toBe(1);
  });
});
