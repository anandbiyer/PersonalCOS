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

  it("opens the day with a proactive COS greeting, and is idempotent per day", async () => {
    const opened = await openDaySession(OWNER_A, { greeting: "Good morning", name: "Anand" });
    expect(opened).toBe(true);

    const turns = await lastTurns(OWNER_A, 10);
    const greetings = turns.filter((t) => t.role === "cos" && t.text.startsWith("Good morning, Anand"));
    expect(greetings.length).toBe(1);
    expect(greetings[0].text).toContain("What would you like to add");

    // Second open the same day is a no-op (no duplicate greeting).
    const again = await openDaySession(OWNER_A, { greeting: "Good morning", name: "Anand" });
    expect(again).toBe(false);
    const after = (await lastTurns(OWNER_A, 10)).filter(
      (t) => t.role === "cos" && t.text.startsWith("Good morning, Anand"),
    );
    expect(after.length).toBe(1);
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
