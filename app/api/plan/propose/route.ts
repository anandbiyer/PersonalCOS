import { NextResponse } from "next/server";
import { getCurrentOwnerId } from "@/lib/auth";
import { proposePlan } from "@/lib/orchestrator/plan";

/**
 * Propose a re-plan (FR45). Computes the moves and persists them as a `plans`
 * proposal; nothing touches the calendar until commit. Returns the plan (or
 * { plan: null } when the day already fits).
 */
export async function POST() {
  const ownerId = await getCurrentOwnerId();
  const plan = await proposePlan(ownerId);
  return NextResponse.json({ plan });
}
