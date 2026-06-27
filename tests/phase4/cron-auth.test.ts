import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cronAuthorized } from "@/lib/cron/auth";

function reqWith(authHeader?: string) {
  return {
    headers: {
      get: (k: string) => (k.toLowerCase() === "authorization" ? authHeader ?? null : null),
    },
  } as unknown as Parameters<typeof cronAuthorized>[0];
}

describe("[P4] cron auth (CRON_SECRET)", () => {
  const orig = process.env.CRON_SECRET;
  beforeAll(() => {
    process.env.CRON_SECRET = "test-secret";
  });
  afterAll(() => {
    if (orig === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = orig;
  });

  it("accepts the correct bearer token (T-CRON-01)", () => {
    expect(cronAuthorized(reqWith("Bearer test-secret"))).toBe(true);
  });

  it("rejects wrong or missing tokens (T-CRON-02)", () => {
    expect(cronAuthorized(reqWith("Bearer nope"))).toBe(false);
    expect(cronAuthorized(reqWith(undefined))).toBe(false);
  });

  it("fails closed when no secret is configured (T-CRON-03)", () => {
    delete process.env.CRON_SECRET;
    expect(cronAuthorized(reqWith("Bearer test-secret"))).toBe(false);
    process.env.CRON_SECRET = "test-secret";
  });
});
