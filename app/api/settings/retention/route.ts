import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentOwnerId } from "@/lib/auth";
import { updateRetention } from "@/lib/db/repo/settings";

/** Update retention windows (FR47). Verbatim days + the tiered month windows. */
const Body = z.object({
  retentionDays: z.number().int().optional(),
  completedArchiveMonths: z.number().int().optional(),
  summaryRetentionMonths: z.number().int().optional(),
});

export async function PATCH(req: NextRequest) {
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
  const settings = await updateRetention(ownerId, parsed.data);
  return NextResponse.json({ settings });
}
