import { NextRequest } from "next/server";
import { runCron } from "@/lib/cron/run";
import { withOwner } from "@/lib/db";
import { audit } from "@/lib/db/schema";
import { listInitiatives } from "@/lib/db/repo/initiatives";
import { dispatch } from "@/lib/notify";

// cron/revalidate — weekly: re-check externally-researched requirements (FR21).
// Phase 4 flags agent-researched initiatives for re-validation and records a
// receipt; live web re-checking arrives with the MCP fetch connector (Phase 6).
export async function GET(req: NextRequest) {
  return runCron(req, async (ownerId) => {
    const inits = await listInitiatives(ownerId);
    const researched = inits.filter((i) => i.knowledgeSource === "researched");
    if (researched.length > 0) {
      await withOwner(ownerId, async (tx) => {
        await tx.insert(audit).values({
          ownerId,
          changeType: "initiative.revalidate",
          newValue: { count: researched.length, ids: researched.map((i) => i.id) },
        });
      });
      await dispatch({
        ownerId,
        kind: "stall",
        message: `${researched.length} researched goal(s) due for requirement re-validation.`,
      });
    }
    return { researched: researched.length };
  });
}
