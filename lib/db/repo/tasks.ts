import { and, desc, eq } from "drizzle-orm";
import { withOwner } from "@/lib/db";
import { tasks, audit, taskStatus, conversationTurns } from "@/lib/db/schema";
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
        status: input.dueDate ? "planned" : "created",
      })
      .returning();
    await tx
      .insert(audit)
      .values({ ownerId, changeType: "task.created", newValue: row });
    return row;
  });
}

/** Hard-delete a task — used for in-thread undo of a just-created task (FR43). */
export async function deleteTask(ownerId: string, id: string) {
  return withOwner(ownerId, async (tx) => {
    await tx.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.ownerId, ownerId)));
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
    return row;
  });
}
