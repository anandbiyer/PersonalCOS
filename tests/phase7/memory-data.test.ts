import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, OWNER_A, OWNER_B } from "../helpers/db";
import { openConversation } from "@/lib/db/repo/conversations";
import { appendTurn, lastTurns, markTurnsPruneEligible } from "@/lib/db/repo/turns";
import { addFact, listFacts, deleteFact } from "@/lib/db/repo/facts";
import { createPlan, agreePlan } from "@/lib/db/repo/plans";
import { saveDaySummary, getDaySummary } from "@/lib/db/repo/summaries";

/**
 * Phase 7 (conversational upgrade) — data layer.
 * Covers FR46/47 storage + NFR-7 isolation for the new memory tables, and the
 * durable-knowledge / completion-pruning guards (FR47 §4.6.1).
 */
describe("[P7] conversation-memory data layer", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await closeDb();
  });

  it("turns, facts, plans, and summaries round-trip", async () => {
    const conv = await openConversation(OWNER_A);
    expect(conv.phase).toBe("open");

    await appendTurn(OWNER_A, { conversationId: conv.id, role: "user", text: "finished the inventory" });
    await appendTurn(OWNER_A, { conversationId: conv.id, role: "cos", text: "nice, that's done" });
    const turns = await lastTurns(OWNER_A, 6);
    expect(turns.map((t) => t.role)).toEqual(["user", "cos"]); // oldest-first

    const fact = await addFact(OWNER_A, { kind: "preference", value: "Deep work before 6am" });
    expect(fact.neverExpire).toBe(true); // durable-knowledge guard defaults on

    const plan = await createPlan(OWNER_A, { date: "2026-07-01", items: [{ tm: "14:00", t: "Call" }] });
    expect(plan.state).toBe("proposed");
    const agreed = await agreePlan(OWNER_A, plan.id);
    expect(agreed.state).toBe("agreed");
    expect(agreed.agreedAt).not.toBeNull();

    await saveDaySummary(OWNER_A, { date: "2026-07-01", summaryText: "Closed inventory; set 2pm call." });
    const sum = await getDaySummary(OWNER_A, "2026-07-01");
    expect(sum?.summaryText).toContain("inventory");
  });

  it("memory tables are tenant-isolated (NFR-7 / RLS)", async () => {
    await addFact(OWNER_A, { kind: "fact", value: "A-only fact" });
    await addFact(OWNER_B, { kind: "fact", value: "B-only fact" });

    const aFacts = await listFacts(OWNER_A);
    const bFacts = await listFacts(OWNER_B);
    expect(aFacts.some((f) => f.value === "A-only fact")).toBe(true);
    expect(aFacts.some((f) => f.value === "B-only fact")).toBe(false);
    expect(bFacts.some((f) => f.value === "B-only fact")).toBe(true);
    expect(bFacts.some((f) => f.value === "A-only fact")).toBe(false);

    const aTurns = await lastTurns(OWNER_A, 50);
    expect(aTurns.every((t) => t.ownerId === OWNER_A)).toBe(true);
  });

  it("completion-pruning flags only turns referencing the completed task", async () => {
    const taskId = "00000000-0000-0000-0000-0000000000a1";
    const conv = await openConversation(OWNER_B);
    const t1 = await appendTurn(OWNER_B, { conversationId: conv.id, role: "user", text: "about task X", refsTaskId: taskId });
    const t2 = await appendTurn(OWNER_B, { conversationId: conv.id, role: "user", text: "unrelated" });

    await markTurnsPruneEligible(OWNER_B, taskId);

    const byId = new Map((await lastTurns(OWNER_B, 50)).map((t) => [t.id, t]));
    expect(byId.get(t1.id)?.pruneEligible).toBe(true);
    expect(byId.get(t2.id)?.pruneEligible).toBe(false);
  });

  it("explicit delete is the only way to remove a durable fact (FR48)", async () => {
    const f = await addFact(OWNER_A, { kind: "commitment", value: "renew LIC annually" });
    await deleteFact(OWNER_A, f.id);
    const remaining = await listFacts(OWNER_A);
    expect(remaining.some((x) => x.id === f.id)).toBe(false);
  });
});
