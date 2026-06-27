import type { NextRequest } from "next/server";

/**
 * Cron route protection (Convention: protect cron with CRON_SECRET). Vercel
 * Cron sends `Authorization: Bearer <CRON_SECRET>`. Fail closed if the secret
 * is not configured.
 */
export function cronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
