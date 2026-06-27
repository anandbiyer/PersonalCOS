import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, asOwner, OWNER_A, OWNER_B, OWNER_C } from "../helpers/db";
import { client } from "@/lib/db";
import {
  createInvitation,
  listInbox,
  listSent,
  acceptInvitation,
  declineInvitation,
} from "@/lib/db/repo/handoff";
import { listTasks } from "@/lib/db/repo/tasks";

/** Phase 5 — cross-user hand-off, copy-on-accept (FR37, NFR-7, Scenario L). */
describe("[P5] cross-user hand-off", () => {
  beforeAll(async () => {
    await resetDb();
    // invitations FK -> users; create both household members.
    await asOwner(OWNER_A, (sql) => sql`INSERT INTO users (id, display_name, theme) VALUES (${OWNER_A}, 'A', 'aurora')`);
    await asOwner(OWNER_B, (sql) => sql`INSERT INTO users (id, display_name, theme) VALUES (${OWNER_B}, 'B', 'sunrise')`);
  });
  afterAll(async () => {
    await resetDb();
    await client.end({ timeout: 5 });
    await closeDb();
  });

  it("accept copies into the recipient's ledger; sender sees status only (T-FR37-01)", async () => {
    const inv = await createInvitation(OWNER_A, { recipientId: OWNER_B, title: "Pick up Aarav — 5 PM" });

    // Recipient sees it pending; nothing in their ledger yet.
    expect((await listInbox(OWNER_B)).map((i) => i.title)).toContain("Pick up Aarav — 5 PM");
    expect(await listTasks(OWNER_B)).toHaveLength(0);

    const res = await acceptInvitation(OWNER_B, inv.id);
    expect(res).not.toBeNull();

    // Copy-on-accept: a task now exists in B's own ledger.
    expect((await listTasks(OWNER_B)).map((t) => t.name)).toContain("Pick up Aarav — 5 PM");
    // Sender sees accepted status; their own ledger is untouched.
    expect((await listSent(OWNER_A))[0].status).toBe("accepted");
    expect(await listTasks(OWNER_A)).toHaveLength(0);
  });

  it("decline creates nothing in the recipient's ledger (T-FR37-02)", async () => {
    const inv = await createInvitation(OWNER_A, { recipientId: OWNER_B, title: "Optional errand" });
    await declineInvitation(OWNER_B, inv.id);
    const sent = await listSent(OWNER_A);
    expect(sent.find((s) => s.title === "Optional errand")?.status).toBe("declined");
    expect((await listTasks(OWNER_B)).map((t) => t.name)).not.toContain("Optional errand");
  });

  it("an unrelated tenant cannot see the invitation (T-NFR7-08)", async () => {
    const seen = await asOwner(OWNER_C, (sql) => sql`SELECT count(*)::int AS c FROM invitations`);
    expect(seen[0].c).toBe(0);
  });
});
