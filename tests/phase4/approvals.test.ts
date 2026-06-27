import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, asOwner, OWNER_A } from "../helpers/db";
import { client } from "@/lib/db";
import { requiresApproval, proposeAction, approveAction } from "@/lib/judgment/approvals";

/** Phase 4 — approval-first execution + graduated trust (FR26). */
describe("[P4] approvals", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await client.end({ timeout: 5 });
    await closeDb();
  });

  it("auto-runs safe actions; gates risky ones unless trusted (T-FR26-01)", () => {
    expect(requiresApproval("reminder")).toBe(false);
    expect(requiresApproval("web_action")).toBe(true);
    expect(requiresApproval("web_action", new Set(["web_action"]))).toBe(false);
  });

  it("proposes a pending action and approves it (T-FR26-02)", async () => {
    const id = await proposeAction(OWNER_A, "web_action", { url: "compare flights" });
    const pending = await asOwner(
      OWNER_A,
      (sql) => sql`SELECT approval_state FROM audit WHERE id = ${id}`,
    );
    expect(pending[0].approval_state).toBe("pending");

    expect(await approveAction(OWNER_A, id)).toBe(true);
    expect(await approveAction(OWNER_A, id)).toBe(false); // already approved

    const after = await asOwner(
      OWNER_A,
      (sql) => sql`SELECT approval_state FROM audit WHERE id = ${id}`,
    );
    expect(after[0].approval_state).toBe("approved");
  });
});
