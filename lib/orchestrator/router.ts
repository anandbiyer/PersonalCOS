import { anthropic, modelFor } from "@/lib/ai";
import { aiOffline } from "@/lib/ai/offline";
import { heuristicClassify } from "@/lib/ai/classify";

/**
 * Intent router (FR43). Every message → exactly one of six intents. The LLM
 * path (Haiku) uses the assembled context to disambiguate; the offline /
 * no-key path is a deterministic heuristic that reuses the capture gate
 * (`heuristicClassify`) for the actionable-vs-conversational call.
 */
export type Intent =
  | "calendar"
  | "task"
  | "completion"
  | "status"
  | "question"
  | "handoff"
  | "reminder";

export interface RouteResult {
  intent: Intent;
  confidence: number;
  via: "llm" | "heuristic";
}

const REMINDER = /\b(remind me|set (a|an)? ?reminder|reminder to)\b|\bevery\s+\d+\s*(hours?|hrs?|minutes?|mins?)\b|\bevery\s+(morning|day|afternoon|evening|night)\b/i;
const HANDOFF = /\b(hand[\s-]?off|delegate)\b|\b(send|forward|assign|give|pass)\b[^?]*\bto\s+[a-z]+/i;
const COMPLETION = /\b(finished|done with|completed|wrapped\s?up|paid|submitted|closed (it|out)|mark(ed)?\s.+\bdone|did the|took care of|sorted out)\b/i;
const QUESTION = /\b(should i|what do you think|your (opinion|advice|take)|any (advice|thoughts)|recommend|suggest|thoughts on|help me think|torn between|not sure (if|whether)|wondering (if|whether)|do you think)\b/i;
const STATUS = /\b(what('?s| is| are)\s+(on|due|left|next|open|pending|my)|show me|list (my|the|out)|how many|on my plate|what do i have|where do (i|we) stand|catch me up|^status\b|what's up)\b/i;
const CALENDAR = /\b(\d{1,2}(:\d{2})?\s?(am|pm)|at \d{1,2}\b|tomorrow|today|tonight|this (morning|afternoon|evening|weekend)|next (week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|on (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|schedule|book(ing)?|appointment|reschedul|move .+ to|came up|fit .+ in|block .+ time|calendar)\b/i;

export function heuristicRoute(message: string): RouteResult {
  const m = message.trim();
  let intent: Intent;
  // "remind me…" is explicit and wins over the calendar/handoff cues it may
  // also contain (a time, or a "…to <name>").
  if (REMINDER.test(m)) intent = "reminder";
  else if (HANDOFF.test(m)) intent = "handoff";
  else if (COMPLETION.test(m)) intent = "completion";
  else if (QUESTION.test(m) || (/\?\s*$/.test(m) && !STATUS.test(m))) intent = "question";
  else if (STATUS.test(m)) intent = "status";
  else if (CALENDAR.test(m)) intent = "calendar";
  else intent = heuristicClassify(m).kind === "conversational" ? "question" : "task";
  return { intent, confidence: 0.55, via: "heuristic" };
}

export async function routeIntent(message: string, context = ""): Promise<RouteResult> {
  if (aiOffline() || !process.env.ANTHROPIC_API_KEY) return heuristicRoute(message);
  try {
    const msg = await anthropic().messages.create({
      model: modelFor(undefined, "route"),
      max_tokens: 64,
      system:
        "You are the intent router for a conversational chief of staff. Classify the manager's " +
        "message into exactly one intent: reminder (asking to be reminded / nudged at a time or on a " +
        "recurring schedule — 'remind me…', 'every 2 hours', 'every morning at 7'), calendar " +
        "(scheduling / an event / a time), task (capture a to-do), completion (something got done), " +
        "status (asking what's on their plate), question (seeking advice or thinking out loud), " +
        "handoff (send a task to a household member). Prefer reminder when the manager explicitly asks " +
        "to be reminded. Use the context only to disambiguate. Respond with ONLY JSON: " +
        '{"intent":"...","confidence":0-1}.',
      messages: [
        { role: "user", content: context ? `Context:\n${context}\n\nMessage: ${message}` : message },
      ],
    });
    const block = msg.content.find((b) => b.type === "text");
    const raw = block && block.type === "text" ? block.text : "";
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as {
      intent?: string;
      confidence?: number;
    };
    const intents: Intent[] = ["calendar", "task", "completion", "status", "question", "handoff", "reminder"];
    const intent = intents.includes(parsed.intent as Intent)
      ? (parsed.intent as Intent)
      : heuristicRoute(message).intent;
    return { intent, confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.8, via: "llm" };
  } catch {
    return heuristicRoute(message);
  }
}
