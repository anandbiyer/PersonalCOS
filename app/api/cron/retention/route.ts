import { NextRequest } from "next/server";
import { runCron } from "@/lib/cron/run";
import { runRetention } from "@/lib/memory/retention";

/**
 * cron/retention — daily tiered retention sweep (FR47 §4.6.1). Verbatim purge +
 * completion-pruning, completed-task archival, and summary roll-off — per
 * tenant, never touching durable knowledge / the ledger.
 */
export async function GET(req: NextRequest) {
  return runCron(req, (ownerId) => runRetention(ownerId));
}
