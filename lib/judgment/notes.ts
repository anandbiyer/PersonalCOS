import { anthropic, MODELS } from "@/lib/ai";
import { aiOffline } from "@/lib/ai/offline";

/**
 * Notes-to-action extraction (FR18): pull decisions, actions, questions, and
 * waiting-ons out of free-text/pasted notes. Claude when available, line-based
 * heuristic otherwise.
 */
export interface NoteExtraction {
  actions: string[];
  decisions: string[];
  questions: string[];
  waitingOns: string[];
  via: "llm" | "heuristic";
}

export function heuristicExtract(notes: string): NoteExtraction {
  const lines = notes
    .split(/\r?\n|•|;/)
    .map((l) => l.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean);
  const out: NoteExtraction = {
    actions: [],
    decisions: [],
    questions: [],
    waitingOns: [],
    via: "heuristic",
  };
  for (const l of lines) {
    const low = l.toLowerCase();
    if (l.endsWith("?")) out.questions.push(l);
    else if (/^(decided|chose|decision|agreed)\b/.test(low)) out.decisions.push(l);
    else if (/\b(waiting|owe[ds]?|pending from|blocked on)\b/.test(low)) out.waitingOns.push(l);
    else out.actions.push(l);
  }
  return out;
}

export async function extractActions(notes: string): Promise<NoteExtraction> {
  if (aiOffline() || !process.env.ANTHROPIC_API_KEY) return heuristicExtract(notes);
  try {
    const msg = await anthropic().messages.create({
      model: MODELS.reasoning,
      max_tokens: 800,
      system:
        "Extract structured items from the notes. Office content uses coded references. " +
        'Respond ONLY JSON: {"actions":[],"decisions":[],"questions":[],"waitingOns":[]}.',
      messages: [{ role: "user", content: notes }],
    });
    const block = msg.content.find((b) => b.type === "text");
    const raw = block && block.type === "text" ? block.text : "";
    const p = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as Partial<NoteExtraction>;
    return {
      actions: (p.actions ?? []).map(String),
      decisions: (p.decisions ?? []).map(String),
      questions: (p.questions ?? []).map(String),
      waitingOns: (p.waitingOns ?? []).map(String),
      via: "llm",
    };
  } catch {
    return heuristicExtract(notes);
  }
}
