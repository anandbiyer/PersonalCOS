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
  | "reminder"
  | "edit"
  | "delete"
  | "chitchat";

export interface RouteResult {
  intent: Intent;
  confidence: number;
  via: "llm" | "heuristic";
}

// A CLOSING / acknowledgement — the WHOLE message is pleasantries with no
// actionable request. Full-message anchor (^…$) so "ok schedule the demo" or
// "nothing is ready, add a task" (which contain real requests) never match.
const CHITCHAT =
  /^(?:\s*(?:thanks?|thank you|thx|ty|ok(?:ay)?|k|cool|great|perfect|awesome|nice|got it|understood|sounds good|will do|all good|all set|cheers|no(?:pe)?|no thanks|nothing(?:\s+(?:else|further|more|needed|required|for now|now))*|that'?s (?:all|it|great|perfect)|never ?mind|nvm|good stuff|much appreciated|appreciate it|you'?re the best|👍|🙏|🙌)[\s.,!]*)+$/i;
const REMINDER = /\b(remind me|set (a|an)? ?reminder|reminder to)\b|\bevery\s+\d+\s*(hours?|hrs?|minutes?|mins?)\b|\bevery\s+(morning|day|afternoon|evening|night)\b/i;
const DELETE = /\b(delete|remove|scrap|get rid of)\b/i;
const EDIT = /\b(change|update|reschedule|rename|push)\b[^?]*\b(to|due|for)\b/i;
const HANDOFF = /\b(hand[\s-]?off|delegate)\b|\b(send|forward|assign|give|pass)\b[^?]*\bto\s+[a-z]+/i;
const COMPLETION = /\b(finished|done with|completed|wrapped\s?up|paid|submitted|closed (it|out)|mark(ed)?\s.+\bdone|did the|took care of|sorted out)\b/i;
const QUESTION = /\b(should i|what do you think|your (opinion|advice|take)|any (advice|thoughts)|recommend|suggest|thoughts on|help me think|torn between|not sure (if|whether)|wondering (if|whether)|do you think)\b/i;
const STATUS = /\b(what('?s| is| are)\s+(on|due|left|next|open|pending|my)|show me|list (my|the|out)|how many|on my plate|what do i have|where do (i|we) stand|catch me up|^status\b|what's up)\b/i;
const CALENDAR = /\b(\d{1,2}(:\d{2})?\s?(am|pm)|at \d{1,2}\b|tomorrow|today|tonight|this (morning|afternoon|evening|weekend)|next (week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|on (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|schedule|book(ing)?|appointment|reschedul|move .+ to|came up|fit .+ in|block .+ time|calendar)\b/i;

export function heuristicRoute(message: string): RouteResult {
  const m = message.trim();
  let intent: Intent;
  // A pure closing/acknowledgement ("thanks", "nothing further") is never an
  // action — reply politely and do nothing. Checked first; the full-message
  // anchor keeps it from swallowing messages that contain a real request.
  if (CHITCHAT.test(m)) intent = "chitchat";
  // "remind me…" is explicit and wins over the calendar/handoff cues it may
  // also contain (a time, or a "…to <name>").
  else if (REMINDER.test(m)) intent = "reminder";
  else if (HANDOFF.test(m)) intent = "handoff";
  else if (COMPLETION.test(m)) intent = "completion";
  // delete/edit reference an existing task; act.ts confirms a match and falls
  // back to a clarifying question when it can't find one.
  else if (DELETE.test(m)) intent = "delete";
  else if (EDIT.test(m)) intent = "edit";
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
        "handoff (send a task to a household member), edit (change an EXISTING task — reschedule, " +
        "rename, move its date), delete (remove/cancel an EXISTING task), chitchat (a closing, " +
        "acknowledgement, thanks, or anything with NO actionable request — e.g. 'thanks', 'nothing " +
        "further', 'ok'). Prefer reminder when the manager explicitly asks to be reminded; prefer " +
        "edit/delete when they refer to a task that already exists; prefer chitchat over guessing an " +
        "action when there is nothing to do. Use the context only to disambiguate. Respond with ONLY " +
        'JSON: {"intent":"...","confidence":0-1}.',
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
    const intents: Intent[] = ["calendar", "task", "completion", "status", "question", "handoff", "reminder", "edit", "delete", "chitchat"];
    const intent = intents.includes(parsed.intent as Intent)
      ? (parsed.intent as Intent)
      : heuristicRoute(message).intent;
    return { intent, confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.8, via: "llm" };
  } catch {
    return heuristicRoute(message);
  }
}
