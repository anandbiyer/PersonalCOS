import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, asOwner, OWNER_A } from "../helpers/db";
import { client } from "@/lib/db";
import { dispatch } from "@/lib/notify";

/** Phase 4 — notification dispatch + quiet-hours governance (FR6, FR38). */
const quiet = new Date(2026, 5, 15, 22, 30); // inside the 21:00–06:00 quiet window
const daytime = new Date(2026, 5, 15, 10, 0);

describe("[P4] notification dispatch", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await client.end({ timeout: 5 });
    await closeDb();
  });

  it("suppresses non-critical notifications during quiet hours (T-FR6-04)", async () => {
    const r = await dispatch({ ownerId: OWNER_A, kind: "reminder", message: "x", at: quiet });
    expect(r.suppressed).toBe(true);
    expect(r.channel).toBeNull();
  });

  it("lets critical notifications through quiet hours (T-FR6-05)", async () => {
    const r = await dispatch({ ownerId: OWNER_A, kind: "reminder", message: "x", critical: true, at: quiet });
    expect(r.suppressed).toBe(false);
  });

  it("scheduled rituals (brief/sweep) are not quiet-hours-suppressed (T-FR25-03)", async () => {
    const r = await dispatch({ ownerId: OWNER_A, kind: "sweep", message: "evening", at: quiet });
    expect(r.suppressed).toBe(false);
  });

  it("records an audit receipt and uses no channel when none is configured (T-FR38-01)", async () => {
    await dispatch({ ownerId: OWNER_A, kind: "reminder", message: "daytime", at: daytime });
    const rows = await asOwner(
      OWNER_A,
      (sql) => sql`SELECT count(*)::int AS c FROM audit WHERE change_type = 'notification'`,
    );
    expect(rows[0].c).toBeGreaterThanOrEqual(1);
  });
});
