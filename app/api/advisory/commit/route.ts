import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentOwnerId } from "@/lib/auth";
import { operationalise } from "@/lib/advisory/operationalise";

const Option = z.object({
  title: z.string(),
  detail: z.string(),
  tradeoffs: z.string(),
});

const Body = z.object({
  situation: z.string().min(1),
  options: z.array(Option).min(1).max(3),
  chosenIndex: z.number().int().min(0),
  reasoning: z.string().optional(),
  portfolio: z.enum(["office", "personal_dev", "personal_life"]),
  name: z.string().optional(),
  nextAction: z.string().optional(),
  nextReviewDays: z.number().int().min(1).max(90).optional(),
});

export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success || parsed.data.chosenIndex >= parsed.data.options.length) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  const ownerId = await getCurrentOwnerId();
  const result = await operationalise(ownerId, parsed.data);
  return NextResponse.json(result);
}
