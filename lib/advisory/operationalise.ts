import { createDecision } from "@/lib/db/repo/decisions";
import { createInitiative } from "@/lib/db/repo/initiatives";
import { createTask } from "@/lib/db/repo/tasks";
import { addDays } from "@/lib/planner/dates";
import type { AdviceOption } from "./types";
import type { Portfolio } from "@/lib/ai/types";

/**
 * Advisory loop step 3 (FR15 -> FR16/FR12): turn a confirmed choice into a
 * tracked plan — a committed Initiative (with a never-empty next action), a
 * first Task realising that action, and a Decision linking them.
 */
export interface OperationaliseInput {
  situation: string;
  options: AdviceOption[];
  chosenIndex: number;
  reasoning?: string;
  portfolio: Portfolio;
  name?: string;
  nextAction?: string;
  nextReviewDays?: number;
}

export async function operationalise(ownerId: string, input: OperationaliseInput) {
  const chosen = input.options[input.chosenIndex];
  if (!chosen) throw new Error("invalid chosen option");

  const now = new Date();
  const nextReview = addDays(now, input.nextReviewDays ?? 7);
  const nextAction = input.nextAction?.trim() || `Start: ${chosen.title}`;
  const name = input.name?.trim() || chosen.title;

  const initiative = await createInitiative(ownerId, {
    name,
    portfolio: input.portfolio,
    stage: "validated",
    outcome: chosen.detail,
    nextAction,
    nextReview,
  });

  const task = await createTask(ownerId, {
    name: nextAction,
    portfolio: input.portfolio,
    dueDate: nextReview,
    source: "text",
    initiativeId: initiative.id,
  });

  const decision = await createDecision(ownerId, {
    context: input.situation,
    alternatives: input.options,
    choice: chosen.title,
    reasoning: input.reasoning ?? "",
    initiativeId: initiative.id,
    taskIds: [task.id],
  });

  return { initiative, task, decision };
}
