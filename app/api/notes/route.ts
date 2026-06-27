import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extractActions } from "@/lib/judgment/notes";

// Notes-to-action extraction (FR18). Returns structured items; it does NOT
// auto-file — filing stays an explicit, separate step.
const Body = z.object({ notes: z.string().min(1).max(8000) });

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
  return NextResponse.json(await extractActions(parsed.data.notes));
}
