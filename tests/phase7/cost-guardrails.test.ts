import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, asOwner, OWNER_A } from "../helpers/db";
import { buildContext } from "@/lib/memory/context";
import { logTurnCost, estTokens, TURN_TOKEN_BUDGET } from "@/lib/memory/budget";
import { createTask } from "@/lib/db/repo/tasks";
import { addFact } from "@/lib/db/repo/facts";

/**
 * Phase 8 — cost guardrails (NFR-10). Context stays under the token cap even
 * with a large ledger; every turn's cost is recorded per owner, and a
 * budget breach is flagged. All deterministic / offline-safe.
 */
const CAP = Number(process.env.MEMORY_CONTEXT_TOKEN_CAP ?? 3000);

describe("[P8] cost guardrails", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await closeDb();
  });

  it("bounds assembled context at the token cap regardless of ledger size", async () => {
    // Flood the ledger + durable facts well past the cap.
    for (let i = 0; i < 60; i++) {
      await createTask(OWNER_A, { name: `Task number ${i} with a reasonably long descriptive name`, portfolio: "office" });
    }
    for (let i = 0; i < 20; i++) {
      await addFact(OWNER_A, { kind: "preference", value: `Durable preference #${i} about how work should be handled` });
    }

    const ctx = await buildContext(OWNER_A, "what's on my plate?");
    expect(ctx.tokensEstimate).toBeLessThanOrEqual(CAP);
    expect(ctx.retrievalUsed).toBe(false); // no reach-back → no retrieval (offline anyway)
  });

  it("records a within-budget turn as an owner-scoped audit row", async () => {
    await resetDb();
    const cost = await logTurnCost(OWNER_A, {
      intent: "task",
      context: "LEDGER:\nOpen (1): call the plumber",
      message: "add: call the plumber",
      reply: "Filed. Anything else?",
    });
    expect(cost.exceeded).toBe(false);
    expect(cost.total).toBe(cost.contextTokens + cost.messageTokens + cost.replyTokens);

    const rows = await asOwner(OWNER_A, async (sql) => {
      return sql`select change_type, action_taken, new_value from audit where change_type = 'memory.turn_cost'`;
    });
    expect(rows.length).toBe(1);
    expect(rows[0].action_taken).toBe("within_budget");
    expect((rows[0].new_value as { total: number }).total).toBe(cost.total);
  });

  it("flags a turn that breaches the per-turn budget", async () => {
    await resetDb();
    const huge = "x ".repeat(TURN_TOKEN_BUDGET * 4); // ~4 chars/token → well over budget
    const cost = await logTurnCost(OWNER_A, { intent: "question", context: huge, message: "hi", reply: "hello" });
    expect(cost.exceeded).toBe(true);
    expect(cost.total).toBeGreaterThan(TURN_TOKEN_BUDGET);

    const rows = await asOwner(OWNER_A, async (sql) => {
      return sql`select action_taken from audit where change_type = 'memory.turn_cost'`;
    });
    expect(rows[0].action_taken).toBe("budget_exceeded");
  });

  it("token estimate is monotonic and cheap", () => {
    expect(estTokens("")).toBe(0);
    expect(estTokens("abcd")).toBe(1);
    expect(estTokens("a".repeat(400))).toBe(100);
  });
});
