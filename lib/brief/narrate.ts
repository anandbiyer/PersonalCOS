import { anthropic, MODELS } from "@/lib/ai";
import { aiOffline } from "@/lib/ai/offline";
import type { Brief } from "./compose";

/**
 * Optional LLM narration of the daily brief (FR25). When ANTHROPIC_API_KEY is
 * set, Claude turns the deterministic facts into 2–3 calm sentences; otherwise
 * (and on any error) the deterministic prose is used. Never throws.
 */
export async function narrateBrief(brief: Brief): Promise<string> {
  if (aiOffline() || !process.env.ANTHROPIC_API_KEY) return brief.prose;
  try {
    const facts =
      `mode=${brief.mode}; due_today=${brief.glance.tasksToday}; ` +
      `overdue=${brief.glance.overdue}; waiting_on=${brief.glance.waitingOn}; ` +
      `focus=[${brief.focus.map((f) => `${f.title} (${f.detail})`).join("; ")}]`;
    const msg = await anthropic().messages.create({
      model: MODELS.fast,
      max_tokens: 220,
      system:
        "You are a calm, concise personal chief of staff. From the facts, write " +
        "2–3 short second-person sentences. No preamble, no bullet lists. " +
        "Morning (am) = orient and prioritise the day; evening (pm) = a reflective " +
        "completeness sweep asking what was committed and what is being waited on.",
      messages: [{ role: "user", content: facts }],
    });
    const block = msg.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text.trim() : brief.prose;
  } catch {
    return brief.prose;
  }
}
