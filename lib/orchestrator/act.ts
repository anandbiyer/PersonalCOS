import { ingestText } from "@/lib/capture/ingest";
import { listTasks, setTaskStatus } from "@/lib/db/repo/tasks";
import { overdueTasks, dueToday, categorizeWaiting, isOpen } from "@/lib/planner/reminders";
import { hasClockTime, sameDay, toDate } from "@/lib/planner/dates";
import { DEFAULT_TASK_DURATION_MIN } from "@/lib/planner/calendar";
import { consultReply } from "@/lib/consult/consult";
import { proposePlan, type ProposedPlan } from "./plan";
import type { Intent } from "./router";

/**
 * Action dispatch (FR43). Each intent calls an EXISTING engine module and
 * returns typed actions for the in-thread cards (with enough to power undo).
 * Action and conversation are layered: a turn may both write and speak.
 *
 * Confirmation scales with stakes: low-risk writes (task/completion) execute
 * and report; cross-tenant handoff returns needsConfirm (defer to the Inbox).
 * Calendar negotiation (propose/agree/commit) is Phase 5 — for now a dated
 * capture is filed directly.
 */
export interface OrchestratorAction {
  type: "task_created" | "done" | "calendar" | "reminder" | "status" | "advice" | "handoff" | "noop" | "plan";
  label: string;
  undo?: { kind: string; id?: string; prev?: string };
  plan?: ProposedPlan; // for type === "plan" — rendered as the revised plan card
}

export interface ActResult {
  actions: OrchestratorAction[];
  /** Text the reply should convey directly (status answer / advice). */
  content?: string;
  needsConfirm?: boolean;
  plan?: ProposedPlan | null;
}

const STOP = new Set([
  "the", "a", "an", "my", "your", "to", "for", "is", "are", "i", "just", "with",
  "and", "of", "on", "that", "this", "it", "please", "can", "you", "finished",
  "done", "completed", "wrapped", "paid", "mark", "as", "up", "off", "task", "item",
]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

interface TimedRow {
  id: string;
  dueDate: Date | string | null;
  effortMin?: number | null;
  status: string;
}

/**
 * True only when a newly added timed item overlaps ANOTHER open timed task on
 * the same day — the one case where adding it genuinely reshapes the day and a
 * re-plan is worth proposing (FR45). A block that simply fits (even inside the
 * broad "office hours" template) files silently, so we don't surface unrelated
 * backlog moves on every calendar capture.
 */
function overlapsExistingTimedTask(newTask: TimedRow, all: TimedRow[]): boolean {
  const due = toDate(newTask.dueDate);
  if (!due || !hasClockTime(due)) return false;
  const s = due.getHours() * 60 + due.getMinutes();
  const e = s + (newTask.effortMin ?? DEFAULT_TASK_DURATION_MIN);
  for (const t of all) {
    if (t.id === newTask.id || t.status === "completed" || t.status === "cancelled") continue;
    const d = toDate(t.dueDate);
    if (!d || !hasClockTime(d) || !sameDay(d, due)) continue;
    const ts = d.getHours() * 60 + d.getMinutes();
    const te = ts + (t.effortMin ?? DEFAULT_TASK_DURATION_MIN);
    if (s < te && ts < e) return true; // half-open interval overlap
  }
  return false;
}

export async function act(
  ownerId: string,
  intent: Intent,
  message: string,
  tz?: string,
): Promise<ActResult> {
  switch (intent) {
    case "task":
    case "calendar": {
      const r = await ingestText(ownerId, message, "text", tz);
      if (!r.filed || !r.task) {
        // Capture gate said conversational → reply as a thought, file nothing.
        const c = await consultReply(ownerId, [{ role: "user", content: message }]);
        return { actions: [{ type: "noop", label: "" }], content: c.reply };
      }
      const dated = Boolean(r.task.dueDate) || intent === "calendar";
      const actions: OrchestratorAction[] = [
        {
          type: dated ? "calendar" : "task_created",
          label: `${dated ? "📅 Added to calendar" : "✓ Task created"}: ${r.task.name}`,
          undo: { kind: "delete_task", id: r.task.id },
        },
      ];

      // A calendar change only reshapes the day when the new timed item clashes
      // with another timed commitment — then, and only then, propose a re-plan
      // (FR45). A block that simply fits is filed silently, so we never surface
      // unrelated backlog moves on a routine add.
      if (intent === "calendar" && r.task.dueDate) {
        const all = await listTasks(ownerId);
        if (overlapsExistingTimedTask(r.task, all)) {
          const plan = await proposePlan(ownerId);
          if (plan) {
            actions.push({ type: "plan", label: "Revised plan", plan });
            return {
              actions,
              plan,
              needsConfirm: true,
              content:
                "That overlaps something you already have today — here's how I'd refit it, with your study block untouched. Agree and I'll set reminders, or tell me what to change.",
            };
          }
        }
      }
      return { actions };
    }

    case "completion": {
      const all = await listTasks(ownerId);
      const open = all.filter((t) => isOpen(t));
      const words = tokens(message);
      let best: (typeof open)[number] | null = null;
      let bestScore = 0;
      for (const t of open) {
        const name = t.name.toLowerCase();
        const score = words.filter((w) => name.includes(w)).length;
        if (score > bestScore) {
          bestScore = score;
          best = t;
        }
      }
      if (!best || bestScore < 1) {
        return {
          actions: [{ type: "noop", label: "" }],
          content: "I couldn't tell which task you finished — which one was it?",
        };
      }
      const prev = best.status;
      await setTaskStatus(ownerId, best.id, "completed");
      return {
        actions: [
          { type: "done", label: `✓ Done: ${best.name}`, undo: { kind: "revert_status", id: best.id, prev } },
        ],
      };
    }

    case "status": {
      const all = await listTasks(ownerId);
      const now = new Date();
      const od = overdueTasks(all, now).length;
      const dt = dueToday(all, now).length;
      const w = categorizeWaiting(all, now);
      const open = all.filter((t) => t.status !== "completed" && t.status !== "cancelled").length;
      return {
        actions: [{ type: "status", label: "" }],
        content: `You have ${open} open item${open === 1 ? "" : "s"} — ${dt} due today, ${od} overdue, ${w.owedToYou.length + w.youOwe.length} waiting-on.`,
      };
    }

    case "question": {
      // Non-directive sounding board — never files (FR33).
      const c = await consultReply(ownerId, [{ role: "user", content: message }]);
      return { actions: [{ type: "advice", label: "" }], content: c.reply };
    }

    case "handoff": {
      // Cross-tenant + high stakes → confirm via the Inbox; never auto-send.
      return {
        actions: [{ type: "handoff", label: "↗ Hand-off" }],
        needsConfirm: true,
        content: "I can hand that to a household member — open the Inbox to confirm the recipient.",
      };
    }
  }
}
