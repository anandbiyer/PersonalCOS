import { anthropic, modelFor } from "@/lib/ai";
import { aiOffline } from "@/lib/ai/offline";
import type { ActResult } from "./act";
import type { Intent } from "./router";

/**
 * Compose the COS's natural-language reply (FR43). When the action already
 * carries content (status answer / advice), that IS the reply. Otherwise we
 * confirm the write + offer a follow-up: deterministic offline (hermetic), or
 * a 1–2 sentence Haiku enhancement when keyed.
 */
function deterministicReply(intent: Intent, result: ActResult): string {
  const label = result.actions.find((a) => a.label)?.label;
  switch (intent) {
    case "task":
      return label ? `${label}. Filed and reminder set — want me to block time for it?` : "Got it — captured.";
    case "calendar":
      return label ? `${label}. Reminder set. Anything else to fit in today?` : "Added to your calendar.";
    case "completion":
      return label
        ? `${label} — nice, that's checked off. Want me to pull anything forward into the freed time?`
        : "Marked done.";
    default:
      return "Done.";
  }
}

export async function composeReply(
  message: string,
  intent: Intent,
  result: ActResult,
): Promise<string> {
  // status / question / noop already carry the spoken content.
  if (result.content) return result.content;

  const base = deterministicReply(intent, result);
  if (aiOffline() || !process.env.ANTHROPIC_API_KEY) return base;
  try {
    const did = result.actions.map((a) => a.label).filter(Boolean).join("; ");
    const msg = await anthropic().messages.create({
      model: modelFor(undefined, "route"),
      max_tokens: 160,
      system:
        "You are a calm, concise chief of staff replying in an ongoing chat. Given the manager's " +
        "message and what you just did, write 1–2 natural sentences confirming it and offering a " +
        "relevant follow-up. No preamble, no lists. Office topics use coded references.",
      messages: [{ role: "user", content: `Manager said: "${message}"\nWhat you did: ${did}` }],
    });
    const block = msg.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text.trim() : base;
  } catch {
    return base;
  }
}
