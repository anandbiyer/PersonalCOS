import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentOwnerId } from "@/lib/auth";
import { getInitiative } from "@/lib/db/repo/initiatives";
import { buildStudyPlan } from "@/lib/initiatives/study-plan";
import { researchRequirements } from "@/lib/advisory/research";

const Body = z.object({
  deadline: z.string().datetime(),
  topics: z.array(z.object({ name: z.string(), weight: z.number().optional() })).optional(),
  research: z.boolean().optional(),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
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
  const initiative = await getInitiative(ownerId, id);
  if (!initiative) return NextResponse.json({ error: "not found" }, { status: 404 });

  let topics = parsed.data.topics ?? [];
  let researched = false;

  // FR20: if no curriculum supplied, research what the goal requires.
  if (topics.length === 0 && parsed.data.research) {
    const result = await researchRequirements(initiative.name);
    if (!result) {
      return NextResponse.json(
        { error: "requirement research unavailable (AI offline) — supply topics" },
        { status: 503 },
      );
    }
    topics = result.topics;
    researched = true;
  }
  if (topics.length === 0) {
    return NextResponse.json({ error: "topics or research:true required" }, { status: 400 });
  }

  const { sessions, taskCount } = await buildStudyPlan(ownerId, id, {
    deadline: new Date(parsed.data.deadline),
    topics,
    researched,
  });

  return NextResponse.json({
    initiativeId: id,
    sessions: sessions.length,
    taskCount,
    plan: sessions.map((s) => ({ date: s.date.toISOString().slice(0, 10), topic: s.topic })),
  });
}
