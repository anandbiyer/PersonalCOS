import { anthropic, modelFor } from "@/lib/ai";
import { aiOffline } from "@/lib/ai/offline";
import type { ActResult } from "./act";
import type { Intent } from "./router";

/**
 * Compose the COS's natural-language reply (FR43). When the action already
 * carries content (status answer / advice / chitchat), that IS the reply.
 * Otherwise we confirm-and-stop: a short, grounded acknowledgement with NO
 * leading follow-up question — a chief of staff files it and reports, it does
 * not interrogate. Deterministic offline (hermetic), or a 1-sentence Haiku
 * phrasing when keyed. Asking "Should I…?/Anything else?" here opens a
 * conversational branch the single-turn router can't reliably answer, so we
 * don't. (See CLAUDE.md / the orchestrator being single-turn.)
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
): Promise<string> {
  // status / question / noop already carry the spoken content.
  if (result.content) return result.content;

  const base = deterministicReply(intent);
  if (aiOffline() || !process.env.ANTHROPIC_API_KEY) return base;
  try {
    const did = result.actions.map((a) => a.label).filter(Boolean).join("; ");
    const msg = await anthropic().messages.create({
      model: modelFor(undefined, "route"),
      max_tokens: 120,
      system:
        "You are a calm, concise chief of staff replying in an ongoing chat. Given the manager's " +
        "message and what you just did, reply with ONE short sentence that confirms what you did. " +
        "Do NOT ask a follow-up question, do NOT offer further help, and state ONLY what you " +
        "actually did — never claim an action you did not take. No preamble, no lists. Office " +
        "topics use coded references.",
      messages: [{ role: "user", content: `Manager said: "${message}"\nWhat you did: ${did}` }],
    });
    const block = msg.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text.trim() : base;
  } catch {
    return base;
  }
}
