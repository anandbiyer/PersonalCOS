import { anthropic, modelFor } from "./index";
import { aiOffline } from "./offline";
import { cleanTaskTitle } from "@/lib/capture/extract-date";
import type { Portfolio } from "./types";

/**
 * Capture classification (FR2) + the conversation-vs-actionable gate (FR33 /
 * Section 6.1). Uses Claude when ANTHROPIC_API_KEY is set, otherwise a
 * deterministic heuristic so dev/tests work without a key.
 */
export type CaptureKind = "actionable" | "conversational";

export interface Classification {
  kind: CaptureKind;
  portfolio: Portfolio;
  title: string;
  confidence: number;
  via: "llm" | "heuristic";
}

const CONVERSATIONAL_MARKERS = [
  "what do you think",
  "should i",
  "thoughts on",
  "your opinion",
  "not sure",
  "wondering if",
  "i'm wondering",
  "im wondering",
  "help me think",
  "what would you",
  "do you think",
  "any advice",
  "brainstorm",
  "torn between",
];

const OFFICE = [
  "client", "deck", "board", "stakeholder", "sprint", "pilot", "spreadx",
  "offsite", "quarterly", "kpi", "deliverable", "presentation", "exec",
  "sme", "report", "office", "meeting", "demo",
];
const DEV = [
  "cert", "certification", "exam", "study", "course", "learn", "learning",
  "aws", "azure", "gcp", "book", "syllabus", "practice test", "training",
  "skill",
];
const LIFE = [
  "vacation", "trip", "flight", "goa", "lic", "insurance", "renewal",
  "premium", "family", "gym", "badminton", "doctor", "dentist", "grocery",
  "home", "car", "birthday", "anniversary", "school", "kids",
];

function score(text: string, kw: string[]): number {
  return kw.reduce((n, k) => n + (text.includes(k) ? 1 : 0), 0);
}

/** Deterministic, key-free classifier. Exported for tests. */
export function heuristicClassify(text: string): Classification {
  const t = text.toLowerCase().trim();
  const kind: CaptureKind = CONVERSATIONAL_MARKERS.some((m) => t.includes(m))
    ? "conversational"
    : "actionable";
  const ranked: [Portfolio, number][] = [
    ["office", score(t, OFFICE)],
    ["personal_dev", score(t, DEV)],
    ["personal_life", score(t, LIFE)],
  ];
  ranked.sort((a, b) => b[1] - a[1]);
  const portfolio = ranked[0][1] > 0 ? ranked[0][0] : "personal_life";
  const title = cleanTaskTitle(text);
  return {
    kind,
    portfolio,
    title,
    confidence: ranked[0][1] > 0 ? 0.6 : 0.3,
    via: "heuristic",
  };
}

export async function classifyCapture(text: string): Promise<Classification> {
  if (aiOffline() || !process.env.ANTHROPIC_API_KEY) return heuristicClassify(text);
  try {
    const client = anthropic();
    const msg = await client.messages.create({
      model: modelFor("office", "classify"),
      max_tokens: 256,
      system:
        "You classify a captured note for a personal chief-of-staff ledger. " +
        "Decide if it is actionable (a task/event/decision) or conversational " +
        "(the user thinking out loud or seeking an opinion). Choose a portfolio: " +
        "office, personal_dev, or personal_life. Office items MUST use coded " +
        "references (e.g. 'Client F'), never verbatim client names. Respond with " +
        'ONLY JSON: {"kind":"actionable|conversational","portfolio":"office|personal_dev|personal_life","title":"short imperative title"}.',
      messages: [{ role: "user", content: text }],
    });
    const block = msg.content.find((b) => b.type === "text");
    const raw = block && block.type === "text" ? block.text : "";
    const parsed = JSON.parse(
      raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1),
    ) as { kind?: string; portfolio?: string; title?: string };
    const portfolios: Portfolio[] = ["office", "personal_dev", "personal_life"];
    return {
      kind: parsed.kind === "conversational" ? "conversational" : "actionable",
      portfolio: portfolios.includes(parsed.portfolio as Portfolio)
        ? (parsed.portfolio as Portfolio)
        : "personal_life",
      title: (parsed.title || text).slice(0, 120),
      confidence: 0.9,
      via: "llm",
    };
  } catch {
    // Never let classification failure drop a capture (NFR-4).
    return heuristicClassify(text);
  }
}
