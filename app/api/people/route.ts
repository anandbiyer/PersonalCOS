import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentOwnerId } from "@/lib/auth";
import { createPerson, listPeople } from "@/lib/db/repo/people";

export async function GET() {
  const ownerId = await getCurrentOwnerId();
  return NextResponse.json({ people: await listPeople(ownerId) });
}

const Body = z.object({
  code: z.string().min(1).max(120),
  role: z.string().optional(),
  behaviourToEnable: z.string().optional(),
  motivators: z.string().optional(),
  lastNudge: z.string().optional(),
  notes: z.string().optional(),
});

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
  const person = await createPerson(ownerId, parsed.data);
  return NextResponse.json({ person });
}
