import { anthropic, MODELS } from "@/lib/ai";
import { aiOffline } from "@/lib/ai/offline";
import { tavilyEnabled, tavilySearch } from "@/lib/connectors/tavily";
import type { StudyTopic } from "@/lib/planner/study";

/**
 * Autonomous requirement research (FR20): structure what an externally-defined
 * goal requires (e.g. a certification curriculum) into weighted topics for the
 * study-plan scheduler. LLM-only for now; web-validated re-checking (FR21) and
 * live sources arrive with the MCP fetch connector in Phase 6. Returns null
 * when AI is offline.
 */
export interface ResearchResult {
  summary: string;
  topics: StudyTopic[];
}

export async function researchRequirements(goal: string): Promise<ResearchResult | null> {
  if (aiOffline() || !process.env.ANTHROPIC_API_KEY) return null;
  try {
    // FR20/FR21: ground the curriculum in live web results when available
    // (personal/dev goals; never office — research targets are personal).
    let webContext = "";
    if (tavilyEnabled()) {
      const hits = await tavilySearch(`${goal} certification requirements exam syllabus topics`, {
        maxResults: 4,
      });
      if (hits.length) {
        webContext =
          "\n\nLive web context (use to keep the curriculum current):\n" +
          hits.map((h) => `- ${h.title}: ${h.content.slice(0, 240)}`).join("\n");
      }
    }
    const msg = await anthropic().messages.create({
      model: MODELS.reasoning,
      max_tokens: 800,
      system:
        "Structure what the stated goal requires into a study curriculum. Return ONLY JSON: " +
        '{"summary":"one line","topics":[{"name":"topic","weight":1}]}. weight is relative ' +
        "effort (1–3). 4–10 topics.",
      messages: [{ role: "user", content: goal + webContext }],
    });
    const block = msg.content.find((b) => b.type === "text");
    const raw = block && block.type === "text" ? block.text : "";
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as {
      summary?: string;
      topics?: { name?: string; weight?: number }[];
    };
    const topics: StudyTopic[] = (parsed.topics ?? [])
      .filter((t) => t.name)
      .map((t) => ({ name: String(t.name), weight: Number(t.weight) || 1 }));
    if (topics.length === 0) return null;
    return { summary: String(parsed.summary ?? ""), topics };
  } catch {
    return null;
  }
}
