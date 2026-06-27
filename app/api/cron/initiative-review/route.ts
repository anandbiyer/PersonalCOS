import { NextRequest } from "next/server";
import { runCron } from "@/lib/cron/run";
import { listInitiatives, recomputeStalled } from "@/lib/db/repo/initiatives";
import { isStalled } from "@/lib/initiatives/invariant";
import { dispatch } from "@/lib/notify";

// cron/initiative-review — weekly: stall/momentum review (FR17). Re-flags
// stalled initiatives and pushes a digest of what needs a next action.
export async function GET(req: NextRequest) {
  return runCron(req, async (ownerId) => {
    const changed = await recomputeStalled(ownerId);
    const inits = await listInitiatives(ownerId);
    const stalled = inits.filter(isStalled);
    if (stalled.length > 0) {
      await dispatch({
        ownerId,
        kind: "stall",
        critical: true,
        message: `${stalled.length} stalled initiative(s) need a next action: ${stalled
          .slice(0, 3)
          .map((i) => i.name)
          .join("; ")}`,
      });
    }
    return { changed, stalled: stalled.length };
  });
}
