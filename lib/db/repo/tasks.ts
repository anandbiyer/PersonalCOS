import { and, desc, eq } from "drizzle-orm";
import { withOwner } from "@/lib/db";
import { tasks, audit, taskStatus, conversationTurns, reminderRules } from "@/lib/db/schema";
import type { Portfolio, CaptureModality } from "@/lib/ai/types";
import { embed, embeddingsEnabled } from "@/lib/ai/embeddings";
import { indexEntity, searchEntityIdsByVector } from "./embeddings";
import { replan, type ReplanItem, type ReplanResult } from "@/lib/planner/replan";

export type TaskStatusValue = (typeof taskStatus.enumValues)[number];

export interface CreateTaskInput {
  name: string;
  portfolio: Portfolio;
  source?: CaptureModality;
  dueDate?: Date | null;
  notes?: string | null;
  priority?: "low" | "normal" | "high" | "urgent";
  initiativeId?: string | null;
  effortMin?: number | null;
  /** FR49: links a calendar-pinned reminder instance to its generator rule. */
  reminderRuleId?: string | null;
}

export interface ListTasksFilter {
  portfolio?: Portfolio;
  status?: TaskStatusValue;
}

/** Create a task and write its audit row atomically, scoped by RLS. */
export async function createTask(ownerId: string, input: CreateTaskInput) {
  return withOwner(ownerId, async (tx) => {
    const [row] = await tx
      .insert(tasks)
      .values({
        ownerId,
        name: input.name,
        portfolio: input.portfolio,
        source: input.source ?? "text",
        dueDate: input.dueDate ?? null,
        notes: input.notes ?? null,
        priority: input.priority ?? "normal",
        initiativeId: input.initiativeId ?? null,
        effortMin: input.effortMin ?? null,
        reminderRuleId: input.reminderRuleId ?? null,
        status: input.dueDate ? "planned" : "created",
      })
      .returning();
    await tx
      .insert(audit)
      .values({ ownerId, changeType: "task.created", newValue: row });
    return row;
  });
}

export interface UpdateTaskInput {
  name?: string;
  dueDate?: Date | null;
  priority?: "low" | "normal" | "high" | "urgent";
  portfolio?: Portfolio;
  effortMin?: number | null;
}

/**
 * Edit an existing task's fields (FR11), recording an audit row with the full
 * before/after (satisfies FR14 for field changes). Setting a due date on an
 * undated task promotes it onto the calendar (created → planned). Returns null
 * if the task doesn't exist for this owner.
 */
export async function updateTask(ownerId: string, id: string, patch: UpdateTaskInput) {
  return withOwner(ownerId, async (tx) => {
    const [prev] = await tx.select().from(tasks).where(eq(tasks.id, id));
    if (!prev) return null;
    const set: Record<string, unknown> = {};
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.dueDate !== undefined) set.dueDate = patch.dueDate;
    if (patch.priority !== undefined) set.priority = patch.priority;
    if (patch.portfolio !== undefined) set.portfolio = patch.portfolio;
    if (patch.effortMin !== undefined) set.effortMin = patch.effortMin;
    // A newly-dated task that was only "created" becomes calendar-planned.
    if (patch.dueDate && prev.status === "created") set.status = "planned";
    if (Object.keys(set).length === 0) return prev;

    const [row] = await tx.update(tasks).set(set).where(eq(tasks.id, id)).returning();
    await tx.insert(audit).values({
      ownerId,
      changeType: "task.updated",
      prevValue: prev,
      newValue: row,
    });
    return row;
  });
}

/** Hard-delete a task — used for in-thread undo of a just-created task (FR43).
 *  If the task was a calendar-pinned reminder instance (FR49), its generator
 *  rule is deleted too, so undo never leaves an orphan rule still firing. */
export async function deleteTask(ownerId: string, id: string) {
  return withOwner(ownerId, async (tx) => {
    const [prev] = await tx.select().from(tasks).where(eq(tasks.id, id));
    await tx.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.ownerId, ownerId)));
    if (prev?.reminderRuleId) {
      await tx.delete(reminderRules).where(eq(reminderRules.id, prev.reminderRuleId));
    }
  });
}

export async function listTasks(ownerId: string, filter: ListTasksFilter = {}) {
  return withOwner(ownerId, async (tx) => {
    const conds = [];
    if (filter.portfolio) conds.push(eq(tasks.portfolio, filter.portfolio));
    if (filter.status) conds.push(eq(tasks.status, filter.status));
    return tx
      .select()
      .from(tasks)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(tasks.createdAt));
  });
}

/** Structured search (FR13) — case-insensitive substring over task name. */
export async function searchTasks(ownerId: string, query: string) {
  const rows = await listTasks(ownerId);
  const q = query.toLowerCase();
  return rows.filter((r) => r.name.toLowerCase().includes(q));
}

/** Best-effort vector indexing of a task (FR13). Failures never surface —
 *  capture must not depend on the embeddings provider (NFR-4/NFR-6). */
export async function indexTask(ownerId: string, taskId: string, text: string) {
  try {
    const vec = await embed(text);
    if (vec) await indexEntity(ownerId, "task", taskId, vec);
  } catch {
    /* ignore */
  }
}

/** Semantic search (FR13). Uses pgvector when embeddings are enabled, falling
 *  back to structured substring search otherwise or on empty results. */
export async function searchTasksSemantic(ownerId: string, query: string) {
  if (embeddingsEnabled()) {
    const vec = await embed(query);
    if (vec) {
      const ids = await searchEntityIdsByVector(ownerId, "task", vec, 20);
      if (ids.length) {
        const rows = await listTasks(ownerId);
        const byId = new Map(rows.map((r) => [r.id, r]));
        const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
        if (ordered.length) return ordered as typeof rows;
      }
    }
  }
  return searchTasks(ownerId, query);
}

/** Apply a replan proposal (FR8): move each task to its new date and set the
 *  lifecycle state (Overdue→Replanned, or Planned for newly-scheduled). */
export async function applyReplan(ownerId: string, items: ReplanItem[]): Promise<number> {
  if (items.length === 0) return 0;
  return withOwner(ownerId, async (tx) => {
    let applied = 0;
    for (const item of items) {
      const [prev] = await tx.select().from(tasks).where(eq(tasks.id, item.id));
      if (!prev) continue;
      const status: TaskStatusValue = item.fromDate ? "replanned" : "planned";
      const [row] = await tx
        .update(tasks)
        .set({ dueDate: item.toDate, status })
        .where(eq(tasks.id, item.id))
        .returning();
      await tx.insert(audit).values({
        ownerId,
        changeType: "task.replanned",
        prevValue: prev,
        newValue: row,
      });
      applied++;
    }
    return applied;
  });
}

/** Compute (and optionally apply) a replan of overdue/unscheduled tasks. */
export async function replanOverdue(
  ownerId: string,
  opts: { apply?: boolean; capacityMin?: number; horizonDays?: number } = {},
): Promise<ReplanResult & { applied: number }> {
  const all = await listTasks(ownerId);
  const result = replan(all, new Date(), {
    capacityMin: opts.capacityMin,
    horizonDays: opts.horizonDays,
  });
  const applied = opts.apply ? await applyReplan(ownerId, result.items) : 0;
  return { ...result, applied };
}

/** FR55 past-due triage: apply Done / Reschedule / Drop to a batch of overdue
 *  tasks. Each item is audited via the existing repo ops (setTaskStatus /
 *  updateTask); ids the owner can't see (RLS) resolve to `ok:false`, not an
 *  error, so one bad row never aborts the batch. Reschedule requires a FUTURE
 *  date. Per-item (not one transaction) — partial success is reported per id. */
export interface TriageResolution {
  id: string;
  action: "done" | "reschedule" | "drop";
  dueDate?: Date | null;
}
export interface TriageResult {
  id: string;
  action: TriageResolution["action"];
  ok: boolean;
  error?: string;
}
export async function applyTriage(
  ownerId: string,
  resolutions: TriageResolution[],
): Promise<TriageResult[]> {
  const now = Date.now();
  const out: TriageResult[] = [];
  for (const r of resolutions) {
    if (r.action === "done") {
      const row = await setTaskStatus(ownerId, r.id, "completed");
      out.push({ id: r.id, action: r.action, ok: !!row });
    } else if (r.action === "drop") {
      const row = await setTaskStatus(ownerId, r.id, "cancelled");
      out.push({ id: r.id, action: r.action, ok: !!row });
    } else {
      // reschedule
      if (!r.dueDate || r.dueDate.getTime() <= now) {
        out.push({ id: r.id, action: r.action, ok: false, error: "reschedule needs a future date" });
        continue;
      }
      const row = await updateTask(ownerId, r.id, { dueDate: r.dueDate });
      out.push({ id: r.id, action: r.action, ok: !!row });
    }
  }
  return out;
}

export async function setTaskStatus(
  ownerId: string,
  id: string,
  status: TaskStatusValue,
) {
  return withOwner(ownerId, async (tx) => {
    const [prev] = await tx.select().from(tasks).where(eq(tasks.id, id));
    const [row] = await tx
      .update(tasks)
      .set({
        status,
        completedAt: status === "completed" ? new Date() : null,
      })
      .where(eq(tasks.id, id))
      .returning();
    await tx.insert(audit).values({
      ownerId,
      changeType: "task.status",
      prevValue: prev ?? null,
      newValue: row ?? null,
    });
    // Completion is a memory boundary (FR47 §4.6.1): flag turns about this task
    // for early pruning so the retention sweep can drop them ahead of the window.
    if (status === "completed") {
      await tx
        .update(conversationTurns)
        .set({ pruneEligible: true })
        .where(and(eq(conversationTurns.ownerId, ownerId), eq(conversationTurns.refsTaskId, id)));
    }
    // FR49 lifecycle: resolving a calendar-pinned reminder instance resolves its
    // rule too. A ONE-OFF rule is deactivated (no nudge for a done/cancelled
    // task); a recurring series (monthly/…) survives — only this instance ends
    // (decision: instance-only, never the series unless asked).
    if ((status === "completed" || status === "cancelled") && row?.reminderRuleId) {
      const [linkedRule] = await tx
        .select()
        .from(reminderRules)
        .where(eq(reminderRules.id, row.reminderRuleId));
      if (linkedRule && linkedRule.schedule === "one_off") {
        await tx.update(reminderRules).set({ active: false }).where(eq(reminderRules.id, linkedRule.id));
      }
    }
    return row;
  });
}
