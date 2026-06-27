import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentOwnerId } from "@/lib/auth";
import { consultReply } from "@/lib/consult/consult";

const Body = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
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
  // Consult never files — it only returns a reply.
  const result = await consultReply(ownerId, parsed.data.messages);
  return NextResponse.json(result);
}
