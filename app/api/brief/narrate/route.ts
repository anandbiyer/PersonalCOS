import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { narrateBrief } from "@/lib/brief/narrate";
import type { Brief } from "@/lib/brief/compose";

/**
 * Narrate the daily brief (FR25). The client composes the brief in its own
 * timezone (FR42) and posts the facts here; we run the optional LLM narration
 * server-side (API key never reaches the browser) and return the prose. Falls
 * back to the deterministic prose when AI is offline or unkeyed.
 */
const Body = z.object({
  mode: z.enum(["am", "pm"]),
  glance: z.object({
    tasksToday: z.number(),
    overdue: z.number(),
    waitingOn: z.number(),
  }),
  focus: z.array(z.object({ title: z.string(), detail: z.string() })).default([]),
  prose: z.string().default(""),
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

  const brief: Brief = {
    mode: parsed.data.mode,
    greeting: "",
    prose: parsed.data.prose,
    focus: parsed.data.focus,
    glance: parsed.data.glance,
  };
  const prose = await narrateBrief(brief);
  return NextResponse.json({ prose });
}
