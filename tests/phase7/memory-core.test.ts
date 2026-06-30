import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, OWNER_A } from "../helpers/db";
import { buildContext, messageReachesBack } from "@/lib/memory/context";
import { extractFacts } from "@/lib/memory/facts";
import { finalizeDaySummary } from "@/lib/memory/summary";
import { createTask, setTaskStatus } from "@/lib/db/repo/tasks";
import { addFact } from "@/lib/db/repo/facts";
import { openConversation } from "@/lib/db/repo/conversations";
import { appendTurn } from "@/lib/db/repo/turns";
import { listDaySummaries } from "@/lib/db/repo/summaries";

/**
 * Phase 7 (conversational upgrade) — memory core (FR46, NFR-10).
 * Hermetic/offline: extraction + retrieval are no-ops; the structured assembler
 * is fully exercised (bounded, excludes completed work).
 */
describe("[P7] memory core", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await closeDb();
  });

  it("messageReachesBack flags backward references only", () => {
    expect(messageReachesBack("what did we decide earlier?")).toBe(true);
    expect(messageReachesBack("you mentioned the pilot scope")).toBe(true);
    expect(messageReachesBack("mark the inventory done")).toBe(false);
    expect(messageReachesBack("add a task to email the plumber")).toBe(false);
  });

  it("buildContext includes durable facts + open ledger, excludes completed, stays bounded", async () => {
    const openT = await createTask(OWNER_A, { name: "Draft the Q3 board deck", portfolio: "office", source: "text" });
    const doneT = await createTask(OWNER_A, { name: "Pay the LIC premium", portfolio: "personal_life", source: "text" });
    await setTaskStatus(OWNER_A, doneT.id, "completed");
    await addFact(OWNER_A, { kind: "preference", value: "Deep work before 6am" });

    const conv = await openConversation(OWNER_A);
    await appendTurn(OWNER_A, { conversationId: conv.id, role: "user", text: "about the deck", refsTaskId: openT.id });
    await appendTurn(OWNER_A, { conversationId: conv.id, role: "user", text: "paid the premium", refsTaskId: doneT.id });

    const ctx = await buildContext(OWNER_A, "what's next?");
    expect(ctx.text).toContain("Deep work before 6am"); // KNOWN (fact-first)
    expect(ctx.text).toContain("Draft the Q3 board deck"); // open task in LEDGER
    expect(ctx.text).not.toContain("Pay the LIC premium"); // completed excluded from ledger
    expect(ctx.text).not.toContain("paid the premium"); // turn about a completed task dropped from RECENT
    expect(ctx.retrievalUsed).toBe(false); // offline → no vector recall
    expect(ctx.tokensEstimate).toBeLessThanOrEqual(3000); // bounded
  });

  it("extractFacts is a deterministic no-op offline", async () => {
    expect(await extractFacts(OWNER_A, "I prefer deep work before 6am")).toBe(0);
  });

  it("finalizeDaySummary writes a durable summary (deterministic offline)", async () => {
    const conv = await openConversation(OWNER_A);
    await appendTurn(OWNER_A, { conversationId: conv.id, role: "user", text: "closed the inventory; set a 2pm call" });

    const txt = await finalizeDaySummary(OWNER_A, "2026-07-02");
    expect(txt).toBeTruthy();
    const sums = await listDaySummaries(OWNER_A, 5);
    expect(sums.some((s) => s.date === "2026-07-02")).toBe(true);
  });

  it("finalizeDaySummary returns null when there are no turns", async () => {
    const { OWNER_C } = await import("../helpers/db");
    expect(await finalizeDaySummary(OWNER_C, "2026-07-03")).toBeNull();
  });
});
