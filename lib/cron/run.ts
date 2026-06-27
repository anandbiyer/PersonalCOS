import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "./auth";
import { listAllOwnerIds } from "@/lib/db/admin";

/**
 * Shared cron harness: verify the CRON_SECRET, enumerate every tenant, and run
 * `perOwner` under each tenant's own RLS context. One tenant's failure never
 * aborts the rest.
 */
export async function runCron(
  req: NextRequest,
  perOwner: (ownerId: string) => Promise<unknown>,
): Promise<NextResponse> {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const owners = await listAllOwnerIds();
  const results: unknown[] = [];
  for (const ownerId of owners) {
    try {
      results.push({ ownerId, ok: true, result: await perOwner(ownerId) });
    } catch (e) {
      results.push({ ownerId, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ processed: owners.length, results });
}
