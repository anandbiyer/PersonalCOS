import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, asOwner, OWNER_A, OWNER_B } from "../helpers/db";
import { client } from "@/lib/db";
import { saveToken, getToken, deleteToken, hasToken } from "@/lib/db/repo/connectors";
import { getPortfolioStatus } from "@/lib/connectors/robinhood";

/** Phase 6 — per-user encrypted connector tokens, RLS-scoped (FR34, NFR-8). */
describe("[P6] connector tokens", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await client.end({ timeout: 5 });
    await closeDb();
  });

  it("stores tokens encrypted and reads them back (T-FR34-06)", async () => {
    await saveToken(OWNER_A, "robinhood", { accessToken: "secret-abc", refreshToken: "refresh-1" });
    const t = await getToken(OWNER_A, "robinhood");
    expect(t?.accessToken).toBe("secret-abc");
    expect(t?.refreshToken).toBe("refresh-1");

    // The stored column must NOT contain the plaintext.
    const raw = await asOwner(
      OWNER_A,
      (sql) => sql`SELECT access_token_enc FROM connector_tokens LIMIT 1`,
    );
    expect(String(raw[0].access_token_enc)).not.toContain("secret-abc");
  });

  it("tokens are RLS-scoped to their owner (T-FR34-07)", async () => {
    expect(await getToken(OWNER_B, "robinhood")).toBeNull();
  });

  it("getPortfolioStatus returns null when not connected (T-FR34-08)", async () => {
    expect(await getPortfolioStatus(OWNER_B)).toBeNull();
  });

  it("disconnect removes the token (T-FR34-09)", async () => {
    await deleteToken(OWNER_A, "robinhood");
    expect(await hasToken(OWNER_A, "robinhood")).toBe(false);
  });
});
