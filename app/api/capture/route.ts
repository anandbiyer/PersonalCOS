import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentOwnerId } from "@/lib/auth";
import { ingestText } from "@/lib/capture/ingest";

/**
 * Text capture (FR1, FR2, FR29). Voice and image have their own routes that
 * transcribe/parse to text, then funnel through the same ingest path.
 * Conversational input is gated out, not filed (FR33).
 */
const Body = z.object({
  text: z.string().min(1).max(4000),
  source: z.enum(["text", "voice", "image"]).optional(),
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
  const result = await ingestText(ownerId, parsed.data.text, parsed.data.source ?? "text");
  return NextResponse.json(result);
}
