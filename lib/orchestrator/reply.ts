import { anthropic, modelFor } from "@/lib/ai";
import { aiOffline } from "@/lib/ai/offline";
import type { ActResult } from "./act";
import type { Intent } from "./router";

/**
 * Compose the COS's natural-language reply (FR43). When the action already
 * carries content (status answer / advice / chitchat / a clarifying ask), that
 * IS the reply. Otherwise we speak like a capable chief of staff about what we
 * just did — grounded in the assembled memory context so the reply reads like
 * it knows the manager, not a form receipt.
 *
 * Runs on the reasoning model (Opus) for Claude-quality conversation; degrades
 * to a deterministic one-liner offline (hermetic tests + a hard cost floor).
 */
function deterministicReply(intent: Intent): string {
  switch (intent) {
    case "task":
      return "Got it — filed to your ledger.";
    case "calendar":
      return "Added to your calendar.";
    case "completion":
      return "Done — checked off.";
    default:
      return "Done.";
  }
}

export async function composeReply(
  message: string,
  intent: Intent,
  result: ActResult,
  context = "",
): Promise<string> {
  // status / question / advice / chitchat / clarifying asks already carry the
  // spoken content.
  if (result.content) return result.content;

  const base = deterministicReply(intent);
  if (aiOffline() || !process.env.ANTHROPIC_API_KEY) return base;
  try {
    const did = result.actions.map((a) => a.label).filter(Boolean).join("; ");
    const msg = await anthropic().messages.create({
      model: modelFor(undefined, "route"),
      max_tokens: 500,
      system:
        "You are the manager's Chief of Staff, replying inside an ongoing daily chat. Talk like a " +
        "sharp, warm, trusted colleague — natural and conversational, not a robot printing a receipt. " +
        "You just handled the manager's message; confirm what you actually did in plain language and, " +
        "when it's genuinely useful, add one short, relevant observation or a next-step suggestion. " +
        "Ground everything in the CONTEXT (their plan, open items, waiting-on, known facts and " +
        "preferences) — reference it naturally when it helps, so the reply feels like it knows them.\n" +
        "Rules: state ONLY what you truly did — never claim an action (filed, scheduled, reminded) you " +
        "did not take. Keep it tight: usually one to three sentences; no bullet lists, no preamble, no " +
        "sign-off. You may ask a clarifying question or offer a next step, but phrase any suggestion so " +
        "the manager can act on it in a single self-contained reply (e.g. 'tell me a time and I'll set a " +
        "reminder' — not a yes/no you'd have to remember). Office topics use coded references (Client A).",
      messages: [
        {
          role: "user",
          content:
            (context ? `CONTEXT:\n${context}\n\n` : "") +
            `Manager said: "${message}"\nWhat you just did: ${did || "(nothing to file — this was conversational)"}`,
        },
      ],
    });
    const block = msg.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text.trim() : "";
    return text || base;
  } catch {
    return base;
  }
}
