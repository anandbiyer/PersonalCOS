import { ingestText } from "@/lib/capture/ingest";
import { listTasks, setTaskStatus, updateTask } from "@/lib/db/repo/tasks";
import { createReminderRule } from "@/lib/db/repo/reminders";
import { parseReminder } from "@/lib/reminders/parse";
import { extractDueDate } from "@/lib/capture/extract-date";
import { overdueTasks, dueToday, categorizeWaiting, isOpen } from "@/lib/planner/reminders";
import { deferPastQuietHours } from "@/lib/planner/quiet-hours";
import { hasClockTime, sameDay, toDate } from "@/lib/planner/dates";
import { DEFAULT_TASK_DURATION_MIN } from "@/lib/planner/calendar";
import { consultReply } from "@/lib/consult/consult";
import { proposePlan, type ProposedPlan } from "./plan";
import type { Intent } from "./router";

/** Friendly local rendering of a fire time for the reminder action card. */
function fmtWhen(d: Date, tz?: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

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
  type:
    | "task_created"
    | "done"
    | "calendar"
    | "reminder"
    | "status"
    | "advice"
    | "handoff"
    | "noop"
    | "plan"
    | "edit"
    | "deleted";
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
  // edit/delete verbs + date words — so they don't inflate the fuzzy match on
  // the distinctive noun ("dry cleaning", "badminton").
  "change", "update", "delete", "remove", "reschedule", "move", "rename", "push",
  "cancel", "drop", "scrap", "edit", "set", "due", "date", "reschedule",
  "today", "tonight", "tomorrow", "next", "week", "month", "day",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

/** Best-matching OPEN task for a message, by keyword overlap on the task name.
 *  Shared by completion / edit / delete. Returns null below the match floor. */
async function matchOpenTask(
  ownerId: string,
  message: string,
): Promise<{ task: Awaited<ReturnType<typeof listTasks>>[number]; score: number } | null> {
  const open = (await listTasks(ownerId)).filter((t) => isOpen(t));
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
  return best && bestScore >= 1 ? { task: best, score: bestScore } : null;
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

    case "reminder": {
      const parsed = parseReminder(message, new Date(), tz);
      if (!parsed) {
        // No schedulable time/recurrence → treat as a normal capture so the
        // intent is never a dead end ("remind me to review the deck").
        const r = await ingestText(ownerId, message, "text", tz);
        if (r.filed && r.task) {
          return {
            actions: [
              {
                type: "task_created",
                label: `✓ Task created: ${r.task.name}`,
                undo: { kind: "delete_task", id: r.task.id },
              },
            ],
          };
        }
        const c = await consultReply(ownerId, [{ role: "user", content: message }]);
        return { actions: [{ type: "noop", label: "" }], content: c.reply };
      }

      const actions: OrchestratorAction[] = [];
      let fireAt = parsed.nextFire;

      if (!parsed.recurring) {
        // One-off: file the underlying to-do so it lands on the ledger/calendar…
        const r = await ingestText(ownerId, message, "text", tz);
        if (r.filed && r.task) {
          actions.push({
            type: "calendar",
            label: `📅 Added: ${r.task.name}`,
            undo: { kind: "delete_task", id: r.task.id },
          });
        }
        // …and push the nudge out of quiet hours so it isn't silently dropped (FR6).
        fireAt = deferPastQuietHours(parsed.nextFire);
      }

      await createReminderRule(ownerId, {
        target: parsed.subject,
        schedule: parsed.schedule,
        scheduleConfig: parsed.scheduleConfig ?? undefined,
        nextFire: fireAt,
      });

      const deferred = !parsed.recurring && fireAt.getTime() !== parsed.nextFire.getTime();
      const when = parsed.recurring
        ? parsed.schedule === "every_n_hours"
          ? `every ${parsed.scheduleConfig?.hours}h`
          : "every day"
        : fmtWhen(fireAt, tz);
      actions.push({
        type: "reminder",
        label: `⏰ Reminder set${deferred ? " (deferred past quiet hours)" : ""}: ${parsed.subject} — ${when}`,
      });
      return {
        actions,
        content: deferred
          ? "That lands inside quiet hours (21:00–06:00), so I set the nudge for 06:00 instead."
          : undefined,
      };
    }

    case "completion": {
      const m = await matchOpenTask(ownerId, message);
      if (!m) {
        return {
          actions: [{ type: "noop", label: "" }],
          content: "I couldn't tell which task you finished — which one was it?",
        };
      }
      const prev = m.task.status;
      await setTaskStatus(ownerId, m.task.id, "completed");
      return {
        actions: [
          { type: "done", label: `✓ Done: ${m.task.name}`, undo: { kind: "revert_status", id: m.task.id, prev } },
        ],
      };
    }

    case "delete": {
      // Soft-delete = cancel: the task drops off open lists but is recoverable
      // (undo) and audited — never a silent hard-delete via chat (FR11/FR14).
      const m = await matchOpenTask(ownerId, message);
      if (!m) {
        return {
          actions: [{ type: "noop", label: "" }],
          content: "Which task should I remove? Tell me its name.",
        };
      }
      const prev = m.task.status;
      await setTaskStatus(ownerId, m.task.id, "cancelled");
      return {
        actions: [
          { type: "deleted", label: `🗑 Removed: ${m.task.name}`, undo: { kind: "revert_status", id: m.task.id, prev } },
        ],
      };
    }

    case "edit": {
      const m = await matchOpenTask(ownerId, message);
      if (!m) {
        return {
          actions: [{ type: "noop", label: "" }],
          content: "Which task did you want to change? Tell me its name.",
        };
      }
      const t = m.task;
      const newDue = extractDueDate(message, new Date(), tz);
      if (!newDue) {
        return {
          actions: [{ type: "noop", label: "" }],
          content: `I found "${t.name}" but couldn't tell what to change — try "change ${t.name} to Friday 3pm".`,
        };
      }
      const updated = await updateTask(ownerId, t.id, { dueDate: newDue });
      if (!updated) {
        return { actions: [{ type: "noop", label: "" }], content: "That task no longer exists." };
      }
      return {
        actions: [
          {
            type: "edit",
            label: `✏️ Updated: ${updated.name} → due ${fmtWhen(newDue, tz)}`,
            undo: {
              kind: "restore_task",
              id: t.id,
              prev: JSON.stringify({ dueDate: t.dueDate ?? null, name: t.name }),
            },
          },
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

    case "chitchat": {
      // A closing / acknowledgement — file nothing, reply warmly, no question.
      return {
        actions: [{ type: "noop", label: "" }],
        content: "You're all set. I'm here whenever you need me.",
      };
    }
  }
}
