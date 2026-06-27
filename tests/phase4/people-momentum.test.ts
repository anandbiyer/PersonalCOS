import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, admin, OWNER_A, OWNER_B } from "../helpers/db";
import { client } from "@/lib/db";
import { createPerson, listPeople } from "@/lib/db/repo/people";
import { createInitiative, recomputeStalled, getInitiative } from "@/lib/db/repo/initiatives";

describe("[P4] people register (FR19) & momentum (FR17)", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await client.end({ timeout: 5 });
    await closeDb();
  });

  it("registers a coded person, RLS-scoped (T-FR19-01)", async () => {
    await createPerson(OWNER_A, { code: "Owner A", role: "SpreadX lead", behaviourToEnable: "ship weekly" });
    expect((await listPeople(OWNER_A)).map((p) => p.code)).toContain("Owner A");
    expect(await listPeople(OWNER_B)).toHaveLength(0);
  });

  it("recomputeStalled re-flags an active initiative that lost its next action (T-FR17-01)", async () => {
    const i = await createInitiative(OWNER_A, {
      name: "Drifting initiative",
      portfolio: "office",
      stage: "validated",
    });
    expect(i.stalled).toBe(true); // active + no next action

    // Simulate the flag drifting out of sync, then re-run the weekly review.
    await admin`UPDATE initiatives SET stalled = false WHERE id = ${i.id}`;
    const changed = await recomputeStalled(OWNER_A);
    expect(changed).toBeGreaterThanOrEqual(1);

    const after = await getInitiative(OWNER_A, i.id);
    expect(after?.stalled).toBe(true);
  });
});
