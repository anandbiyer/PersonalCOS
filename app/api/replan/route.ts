import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentOwnerId } from "@/lib/auth";
import { replanOverdue } from "@/lib/db/repo/tasks";

// Automatic replanning (FR8). Returns a proposal; pass {apply:true} to write it.
const Body = z.object({ apply: z.boolean().optional() });

export async function POST(req: NextRequest) {
  let json: unknown = {};
  try {
    json = await req.json();
  } catch {
    /* empty body is fine — defaults to a dry-run proposal */
  }
  const parsed = Body.safeParse(json ?? {});
  const apply = parsed.success ? !!parsed.data.apply : false;
  const ownerId = await getCurrentOwnerId();
  const result = await replanOverdue(ownerId, { apply });
  return NextResponse.json({
    applied: result.applied,
    moved: result.items.length,
    conflicts: result.conflicts,
    items: result.items.map((i) => ({
      id: i.id,
      name: i.name,
      toDate: i.toDate.toISOString().slice(0, 10),
      reason: i.reason,
    })),
  });
}
