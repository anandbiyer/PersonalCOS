import { NextResponse } from "next/server";
import { getCurrentOwnerId } from "@/lib/auth";
import { listHouseholdRoster } from "@/lib/db/admin";

// Household roster for the hand-off recipient picker (id + name only).
export async function GET() {
  const ownerId = await getCurrentOwnerId();
  const roster = await listHouseholdRoster();
  return NextResponse.json({ roster: roster.filter((r) => r.id !== ownerId) });
}
