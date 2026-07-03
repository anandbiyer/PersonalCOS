import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, asOwner, OWNER_A, OWNER_B } from "../helpers/db";
import { openConversation, currentConversation } from "@/lib/db/repo/conversations";
import { appendTurn, turnsForConversation, lastTurns } from "@/lib/db/repo/turns";
import { openDaySession } from "@/lib/session/lifecycle";
import { sameDayInTz } from "@/lib/planner/dates";

/**
 * FR53 — daily session refresh. The home thread is scoped to the current
 * day-session's conversation, so a new day opens a FRESH chat and the prior
 * day's dialogue drops out of the inline view. Deterministic / DB-backed.
 */
describe("[P9] FR53 — conversation-scoped home thread", () => {
  beforeAll(resetDb);
  afterAll(resetDb); // the DB pool is closed once, in the last describe below

  it("returns only the given conversation's turns, oldest-first", async () => {
    await resetDb();
    const yesterday = await openConversation(OWNER_A);
    await appendTurn(OWNER_A, { conversationId: yesterday.id, role: "user", text: "yesterday-1" });
    await appendTurn(OWNER_A, { conversationId: yesterday.id, role: "cos", text: "yesterday-2" });
    const today = await openConversation(OWNER_A);
    await appendTurn(OWNER_A, { conversationId: today.id, role: "user", text: "today-1" });

    expect((await turnsForConversation(OWNER_A, yesterday.id, 200)).map((t) => t.text)).toEqual([
      "yesterday-1",
      "yesterday-2",
    ]);
    expect((await turnsForConversation(OWNER_A, today.id, 200)).map((t) => t.text)).toEqual(["today-1"]);
    // The old unscoped fetch still returns across all conversations (the bug).
    expect((await lastTurns(OWNER_A, 50)).length).toBe(3);
  });

  it("a freshly-opened day-session has zero inline turns (the fresh chat)", async () => {
    await resetDb();
    const yesterday = await openConversation(OWNER_A);
    await appendTurn(OWNER_A, { conversationId: yesterday.id, role: "user", text: "old" });
    const today = await openConversation(OWNER_A); // new day rolls a new session

    const conv = await currentConversation(OWNER_A);
    expect(conv!.id).toBe(today.id); // currentConversation = most recent
    // Home would render greeting + plan + composer only — no carried-over turns.
    expect(await turnsForConversation(OWNER_A, conv!.id, 200)).toHaveLength(0);
  });

  it("is tenant-isolated (RLS): one owner can't read another's conversation turns", async () => {
    await resetDb();
    const ca = await openConversation(OWNER_A);
    await appendTurn(OWNER_A, { conversationId: ca.id, role: "user", text: "a-only" });
    const cb = await openConversation(OWNER_B);
    await appendTurn(OWNER_B, { conversationId: cb.id, role: "user", text: "b-only" });

    expect((await turnsForConversation(OWNER_A, ca.id, 200)).map((t) => t.text)).toEqual(["a-only"]);
    // Scoping by A's conversation under B's context yields nothing (RLS).
    expect(await turnsForConversation(OWNER_B, ca.id, 200)).toHaveLength(0);
  });
});

describe("[P9] FR54 — timezone-correct session-day boundary", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await closeDb();
  });

  it("sameDayInTz rolls the day at the owner's local midnight, not UTC", () => {
    const tz = "America/New_York";
    const a = new Date("2026-07-03T01:00:00Z"); // Jul 2, 21:00 EDT
    const b = new Date("2026-07-03T03:30:00Z"); // Jul 2, 23:30 EDT
    const c = new Date("2026-07-03T04:30:00Z"); // Jul 3, 00:30 EDT
    expect(sameDayInTz(a, b, tz)).toBe(true); // same local day (Jul 2)
    expect(sameDayInTz(a, c, tz)).toBe(false); // crossed local midnight → Jul 3
    // a and c share the same UTC calendar day (Jul 3) — the old UTC `sameDay`
    // would wrongly call them the same day; the tz-aware check does not.
  });

  it("openDaySession is idempotent within the owner-local day and opens a fresh one after local midnight", async () => {
    await resetDb();
    await asOwner(
      OWNER_A,
      (sql) =>
        sql`INSERT INTO users (id, display_name, timezone) VALUES (${OWNER_A}, 'Tester', 'America/New_York')
            ON CONFLICT (id) DO UPDATE SET timezone = 'America/New_York'`,
    );
    expect(await openDaySession(OWNER_A)).toBe(true); // first open
    expect(await openDaySession(OWNER_A)).toBe(false); // same local day → no new session

    // Backdate the session to a prior local day → the next call opens a fresh one.
    await asOwner(OWNER_A, (sql) => sql`UPDATE conversations SET started_at = now() - interval '2 days'`);
    expect(await openDaySession(OWNER_A)).toBe(true);
  });
});
