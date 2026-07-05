import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentOwnerId } from "@/lib/auth";
import { applyTriage } from "@/lib/db/repo/tasks";

// FR55 — batch past-due triage. Applies Done / Reschedule / Drop to a set of
// overdue tasks in one request (the OverdueReviewCard's Apply). Reschedule
// carries an ISO due date collected by the card's inline picker (device tz →
// UTC per FR42). RLS scoping happens inside the repo ops.
const Resolution = z.object({
  id: z.string().uuid(),
  action: z.enum(["done", "reschedule", "drop"]),
  dueDate: z.string().datetime().nullable().optional(),
});
const Body = z.object({ resolutions: z.array(Resolution).min(1).max(50) });

export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  const ownerId = await getCurrentOwnerId();
  const results = await applyTriage(
    ownerId,
    parsed.data.resolutions.map((r) => ({
      id: r.id,
      action: r.action,
      dueDate: r.dueDate ? new Date(r.dueDate) : null,
    })),
  );
  return NextResponse.json({ results });
}
