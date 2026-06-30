import { ingestText } from "@/lib/capture/ingest";
import { listTasks, setTaskStatus } from "@/lib/db/repo/tasks";
import { overdueTasks, dueToday, categorizeWaiting, isOpen } from "@/lib/planner/reminders";
import { consultReply } from "@/lib/consult/consult";
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
  type: "task_created" | "done" | "calendar" | "reminder" | "status" | "advice" | "handoff" | "noop";
  label: string;
  undo?: { kind: string; id?: string; prev?: string };
}

export interface ActResult {
  actions: OrchestratorAction[];
  /** Text the reply should convey directly (status answer / advice). */
  content?: string;
  needsConfirm?: boolean;
  plan?: unknown; // Phase 5
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
      return {
        actions: [
          {
            type: dated ? "calendar" : "task_created",
            label: `${dated ? "📅 Added to calendar" : "✓ Task created"}: ${r.task.name}`,
            undo: { kind: "delete_task", id: r.task.id },
          },
        ],
      };
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
