import { listTasks } from "@/lib/db/repo/tasks";
import { lastTurns } from "@/lib/db/repo/turns";
import { listDaySummaries } from "@/lib/db/repo/summaries";
import { listFacts } from "@/lib/db/repo/facts";
import { overdueTasks, dueToday, categorizeWaiting } from "@/lib/planner/reminders";
import { embeddingsEnabled, embed } from "@/lib/ai/embeddings";
import { searchMemory } from "@/lib/db/repo/embeddings";
import { estTokens } from "@/lib/memory/budget";

/**
 * Per-turn context assembler (FR46 §4.4, NFR-10). Bounded budget — the single
 * biggest cost lever. Composition (cheap → expensive):
 *   KNOWN  durable facts (always; small, high-signal)
 *   SUMMARY latest day-summary
 *   LEDGER  open/overdue/due-today/waiting — the real memory; EXCLUDES completed
 *   RECENT  last ~6 OPEN turns (drops turns about completed tasks)
 *   RECALL  conditional top-k retrieval, ONLY when the message reaches back
 * Capped at MEMORY_CONTEXT_TOKEN_CAP (~3k). Retrieval is skipped offline (no
 * embeddings), giving a deterministic, hermetic, cost-floored path.
 */
const CAP = Number(process.env.MEMORY_CONTEXT_TOKEN_CAP ?? 3000);

export function messageReachesBack(message: string): boolean {
  return /\b(earlier|before|last (week|month|time|year)|previously|you (said|mentioned|told)|we (discussed|decided|talked|agreed)|remember|recall|what was|going back|that (thing|note|idea) (we|i))\b/i.test(
    message,
  );
}

export interface BuiltContext {
  text: string;
  tokensEstimate: number;
  retrievalUsed: boolean;
}

export async function buildContext(ownerId: string, message: string): Promise<BuiltContext> {
  const now = new Date();
  const tasks = await listTasks(ownerId);
  const completedIds = new Set(
    tasks.filter((t) => t.status === "completed").map((t) => t.id),
  );

  // Durable knowledge — cheap, always include a few (fact-first).
  const facts = (await listFacts(ownerId, { activeOnly: true })).slice(0, 8);
  const known = facts.length
    ? "KNOWN:\n" + facts.map((f) => `- [${f.kind}] ${f.value}`).join("\n")
    : "";

  // Latest day-summary (T2).
  const summaries = await listDaySummaries(ownerId, 1);
  const summary = summaries[0] ? "SUMMARY:\n" + summaries[0].summaryText : "";

  // Ledger slice — the real memory; completed items are excluded entirely.
  const open = tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");
  const od = overdueTasks(tasks, now);
  const dt = dueToday(tasks, now);
  const w = categorizeWaiting(tasks, now);
  const ledger =
    "LEDGER:\n" +
    [
      `Open (${open.length}): ${open.slice(0, 8).map((t) => t.name).join("; ") || "none"}`,
      od.length ? `Overdue: ${od.slice(0, 5).map((t) => t.name).join("; ")}` : "",
      dt.length ? `Due today: ${dt.slice(0, 5).map((t) => t.name).join("; ")}` : "",
      w.owedToYou.length || w.youOwe.length
        ? `Waiting-on: ${[...w.owedToYou, ...w.youOwe].slice(0, 5).map((x) => x.task.name).join("; ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

  // Recent OPEN turns — drop turns that only concern a completed task.
  const recent = (await lastTurns(ownerId, 6)).filter(
    (t) => !t.refsTaskId || !completedIds.has(t.refsTaskId),
  );
  const recentText = recent.length
    ? "RECENT:\n" + recent.map((t) => `${t.role}: ${t.text}`).join("\n")
    : "";

  // Conditional retrieval — only when the message references the past, and only
  // when embeddings are enabled (offline → skipped → structured-only).
  let retrieved = "";
  let retrievalUsed = false;
  if (messageReachesBack(message) && embeddingsEnabled()) {
    const vec = await embed(message);
    if (vec) {
      const hits = await searchMemory(ownerId, vec, 5);
      if (hits.length) {
        retrieved = "RECALL:\n" + hits.map((h) => `- ${h.text}`).join("\n");
        retrievalUsed = true;
      }
    }
  }

  // Assemble within the cap (priority order).
  const ordered = [known, summary, ledger, recentText, retrieved].filter(Boolean);
  const out: string[] = [];
  let used = 0;
  for (const s of ordered) {
    const t = estTokens(s);
    if (used + t > CAP) {
      const roomChars = Math.max(0, CAP - used) * 4;
      if (roomChars > 120) out.push(s.slice(0, roomChars));
      break;
    }
    out.push(s);
    used += t;
  }
  const text = out.join("\n\n");
  return { text, tokensEstimate: estTokens(text), retrievalUsed };
}
