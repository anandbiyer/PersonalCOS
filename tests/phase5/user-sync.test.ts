import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb } from "../helpers/db";
import {
  adminUpsertUserFromClerk,
  adminGetUserByClerkId,
  adminDeleteUserByClerkId,
  listHouseholdRoster,
  closeAdmin,
} from "@/lib/db/admin";

/** Phase 5 — Clerk -> Postgres user sync (FR36, NFR-9). */
describe("[P5] clerk user sync", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await closeAdmin();
    await closeDb();
  });

  it("upserts a user and maps clerk id -> owner id (T-FR36-01)", async () => {
    const id = await adminUpsertUserFromClerk({ clerkId: "clerk_a", displayName: "Anand" });
    const u = await adminGetUserByClerkId("clerk_a");
    expect(u?.id).toBe(id);
    expect(u?.displayName).toBe("Anand");
  });

  it("updates on re-sync rather than duplicating (T-FR36-02)", async () => {
    const id1 = await adminUpsertUserFromClerk({ clerkId: "clerk_a", displayName: "Anand B" });
    const u = await adminGetUserByClerkId("clerk_a");
    expect(u?.id).toBe(id1); // same row
    expect(u?.displayName).toBe("Anand B");
  });

  it("builds the household roster and deletes on user.deleted (T-NFR9-01)", async () => {
    await adminUpsertUserFromClerk({ clerkId: "clerk_b", displayName: "Spouse" });
    expect((await listHouseholdRoster()).length).toBeGreaterThanOrEqual(2);

    await adminDeleteUserByClerkId("clerk_a");
    expect(await adminGetUserByClerkId("clerk_a")).toBeNull();
  });
});
