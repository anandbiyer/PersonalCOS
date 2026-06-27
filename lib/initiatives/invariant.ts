/**
 * The anti-ideation invariant (FR16 / §9.2): every ACTIVE initiative must
 * always carry a next concrete action AND a next review date. If either is
 * missing it is "stalled" and surfaced in the daily brief. Idea (not yet
 * committed) and Adopted (done) stages are exempt.
 */
export const STAGE_ORDER = ["idea", "validated", "in_dev", "piloted", "adopted"] as const;
export type Stage = (typeof STAGE_ORDER)[number];

export const ACTIVE_STAGES: Stage[] = ["validated", "in_dev", "piloted"];

export function isActiveStage(stage: string): boolean {
  return (ACTIVE_STAGES as string[]).includes(stage);
}

export interface InitiativeLike {
  stage: string;
  nextAction?: string | null;
  nextReview?: Date | string | null;
}

export function isStalled(i: InitiativeLike): boolean {
  if (!isActiveStage(i.stage)) return false;
  return !i.nextAction || !i.nextReview;
}

/** Guard for the stage-gate forcing question: entering an active stage requires
 *  a next action and a next review (who owns the first step, by when). */
export function canEnterStage(
  toStage: string,
  nextAction: string | null | undefined,
  nextReview: Date | string | null | undefined,
): { ok: boolean; reason?: string } {
  if (!isActiveStage(toStage)) return { ok: true };
  if (!nextAction || !nextReview) {
    return {
      ok: false,
      reason:
        "Anti-ideation: an active initiative needs a next action and a next review date " +
        "(what is the smallest step that produces a real outcome, and by when?).",
    };
  }
  return { ok: true };
}

export function stageIndex(stage: string): number {
  return (STAGE_ORDER as readonly string[]).indexOf(stage);
}
