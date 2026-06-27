import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { advise } from "@/lib/advisory/advise";

const Body = z.object({ situation: z.string().min(3).max(4000) });

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
  const advice = await advise(parsed.data.situation);
  return NextResponse.json(advice);
}
