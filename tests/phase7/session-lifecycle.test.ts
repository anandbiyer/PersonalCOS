import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, OWNER_A } from "../helpers/db";
import { openDaySession, closeDaySession } from "@/lib/session/lifecycle";
import { lastTurns } from "@/lib/db/repo/turns";
import { currentConversation } from "@/lib/db/repo/conversations";
import { listDaySummaries } from "@/lib/db/repo/summaries";

/**
 * Phase 7 (conversational upgrade) — daily session lifecycle (FR44).
 */
describe("[P7] session lifecycle (open / close)", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await closeDb();
  });

  it("opens the day-session record and is idempotent per day", async () => {
    expect(await openDaySession(OWNER_A)).toBe(true);
    const conv = await currentConversation(OWNER_A);
    expect(conv).not.toBeNull();
    // The greeting is client-rendered, so open posts no turn yet.
    expect((await lastTurns(OWNER_A, 10)).length).toBe(0);
    // Second open the same day is a no-op.
    expect(await openDaySession(OWNER_A)).toBe(false);
  });

  it("closes the day: posts the sweep, marks the session closed, finalizes a summary", async () => {
    await closeDaySession(OWNER_A, "Evening sweep: 2 items still open; confirm what you committed to today.");

    const turns = await lastTurns(OWNER_A, 10);
    expect(turns.some((t) => t.role === "cos" && t.text.startsWith("Evening sweep"))).toBe(true);

    const conv = await currentConversation(OWNER_A);
    expect(conv?.phase).toBe("close");

    const summaries = await listDaySummaries(OWNER_A, 5);
    expect(summaries.length).toBeGreaterThan(0);
  });
});
