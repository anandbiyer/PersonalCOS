import { addDays, daysBetween, startOfDay } from "./dates";

/**
 * Backward-planned study-plan generation (FR9) — the capacity scheduler (FR5)
 * applied to a knowledge goal. Distributes curriculum topics across the study
 * days available before an external deadline, weighted by topic, leaving a
 * review buffer near the deadline.
 */
export interface StudyTopic {
  name: string;
  weight?: number; // relative effort; default 1
}

export interface StudySession {
  date: Date;
  topic: string;
}

export interface StudyPlanOptions {
  now: Date;
  deadline: Date;
  topics: StudyTopic[];
  /** Reserve this many days before the deadline for review. Default 2. */
  reviewBufferDays?: number;
}

export function generateStudyPlan(opts: StudyPlanOptions): StudySession[] {
  const { now, deadline, topics } = opts;
  const buffer = opts.reviewBufferDays ?? 2;
  if (topics.length === 0) return [];

  const start = addDays(startOfDay(now), 1); // begin tomorrow
  const lastStudyDay = addDays(startOfDay(deadline), -buffer);
  const span = daysBetween(start, lastStudyDay);
  if (span < 0) {
    // Deadline too close — schedule one session per remaining day up to deadline.
    const tight = Math.max(0, daysBetween(start, startOfDay(deadline)));
    return topics.slice(0, tight + 1).map((t, i) => ({
      date: addDays(start, i),
      topic: t.name,
    }));
  }

  // Build a weighted topic sequence, then spread across study days in order.
  const sequence: string[] = [];
  for (const t of topics) {
    const reps = Math.max(1, Math.round(t.weight ?? 1));
    for (let r = 0; r < reps; r++) sequence.push(t.name);
  }

  const totalDays = span + 1; // inclusive
  const sessions: StudySession[] = [];
  // Place sequence items evenly across the available study days.
  for (let i = 0; i < sequence.length; i++) {
    const dayOffset = Math.floor((i * totalDays) / sequence.length);
    sessions.push({ date: addDays(start, dayOffset), topic: sequence[i] });
  }
  // Append a review session in the buffer window.
  sessions.push({ date: addDays(startOfDay(deadline), -1), topic: "Review & practice test" });
  return sessions;
}
