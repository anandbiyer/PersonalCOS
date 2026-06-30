import { anthropic, modelFor } from "@/lib/ai";
import { aiOffline } from "@/lib/ai/offline";
import { lastTurns } from "@/lib/db/repo/turns";
import { saveDaySummary } from "@/lib/db/repo/summaries";
import { embed, embeddingsEnabled } from "@/lib/ai/embeddings";
import { indexEntity } from "@/lib/db/repo/embeddings";

/**
 * Finalize the day into a durable T2 day-summary (FR46 §4.5), called at session
 * close (Phase 6 cron/sweep). Online: Haiku condenses the day's turns into open
 * threads / decisions / waiting-on. Offline: a deterministic précis, so a close
 * always yields a summary (regenerable from raw turns while they exist). Embeds
 * the summary for retrieval when keyed. Returns the summary text, or null when
 * there were no turns.
 *
 * Note: a per-turn incremental rolling summary is deliberately deferred — the
 * recent-turns window + durable facts already ground within-day context, and
 * skipping a per-turn summarize call keeps per-turn cost down (NFR-10).
 */
export async function finalizeDaySummary(
  ownerId: string,
  date: string,
): Promise<string | null> {
  const turns = await lastTurns(ownerId, 40);
  if (turns.length === 0) return null;

  let summaryText: string;
  if (aiOffline() || !process.env.ANTHROPIC_API_KEY) {
    const userLines = turns.filter((t) => t.role === "user").map((t) => t.text);
    summaryText = `Session ${date}: ${turns.length} turns. ${userLines.slice(-8).join(" · ")}`.slice(0, 700);
  } else {
    try {
      const msg = await anthropic().messages.create({
        model: modelFor(undefined, "summarize"),
        max_tokens: 300,
        system:
          "Summarize the day's chief-of-staff session in <=120 words: open threads, decisions made, " +
          "what's being waited on, and plan state. Structured and terse. Office uses coded references.",
        messages: [{ role: "user", content: turns.map((t) => `${t.role}: ${t.text}`).join("\n") }],
      });
      const block = msg.content.find((b) => b.type === "text");
      summaryText =
        block && block.type === "text" ? block.text.trim() : `Session ${date}: ${turns.length} turns.`;
    } catch {
      summaryText = `Session ${date}: ${turns.length} turns.`;
    }
  }

  const row = await saveDaySummary(ownerId, { date, summaryText });
  if (embeddingsEnabled()) {
    const vec = await embed(summaryText);
    if (vec) await indexEntity(ownerId, "summary", row.id, vec, "summary");
  }
  return summaryText;
}
