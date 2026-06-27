import { anthropic, MODELS } from "@/lib/ai";
import { aiOffline } from "@/lib/ai/offline";
import { heuristicClassify } from "@/lib/ai/classify";
import { notionEnabled, notionSearch } from "@/lib/connectors/notion";
import { listInitiatives } from "@/lib/db/repo/initiatives";
import { listDecisions } from "@/lib/db/repo/decisions";

/**
 * Consult / sounding-board mode (FR33): a NON-directive register of the System
 * of Judgment. Talks things through, grounded in the owner's initiatives and
 * decisions. It NEVER files anything and never claims to — capture happens only
 * if the owner explicitly opts in via the normal capture path. Exempt from the
 * anti-ideation invariant.
 */
export interface ConsultMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ConsultResult {
  reply: string;
  via: "llm" | "offline";
}

export async function consultReply(
  ownerId: string,
  messages: ConsultMessage[],
): Promise<ConsultResult> {
  if (aiOffline() || !process.env.ANTHROPIC_API_KEY) {
    return {
      reply:
        "Consult needs the AI provider enabled to talk things through. Nothing gets filed " +
        "here regardless — when you want something captured, say so explicitly.",
      via: "offline",
    };
  }

  // Ground the conversation in the owner's real context (read-only).
  const inits = await listInitiatives(ownerId);
  const decs = await listDecisions(ownerId);
  let ground =
    `Active initiatives: ${inits.slice(0, 8).map((i) => `${i.name} [${i.stage}]`).join("; ") || "none"}. ` +
    `Recent decisions: ${decs.slice(0, 5).map((d) => d.choice).filter(Boolean).join("; ") || "none"}.`;

  // FR31: ground in the owner's Notion notes — but never send an office/coded
  // message to the cloud connector (office notes stay in Postgres).
  const lastMsg = messages[messages.length - 1]?.content ?? "";
  if (notionEnabled() && heuristicClassify(lastMsg).portfolio !== "office") {
    try {
      const notes = await notionSearch(lastMsg, { maxResults: 3 });
      if (notes.length) ground += ` Relevant notes: ${notes.map((n) => n.title).join("; ")}.`;
    } catch {
      /* notion optional */
    }
  }

  const msg = await anthropic().messages.create({
    model: MODELS.reasoning,
    max_tokens: 700,
    system:
      "You are the owner's chief of staff in CONSULT mode — a non-directive sounding board. " +
      "Think out loud with them and offer an opinion when asked, official or personal. Do NOT " +
      "produce a plan, task list, or filing unless explicitly asked, and NEVER claim to have " +
      "filed or scheduled anything. Office topics use coded references. Context — " + ground,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
  const block = msg.content.find((b) => b.type === "text");
  return { reply: block && block.type === "text" ? block.text.trim() : "", via: "llm" };
}
