import { createTask } from "@/lib/db/repo/tasks";
import { setNextAction, setStudyMeta } from "@/lib/db/repo/initiatives";
import { generateStudyPlan, type StudySession, type StudyTopic } from "@/lib/planner/study";

/**
 * Operationalise a study plan (FR9): backward-plan the curriculum into sessions,
 * create a planned task per session linked to the initiative, set the
 * initiative's external deadline + knowledge source, and seed its next action
 * with the first session (so it is never stalled).
 */
export async function buildStudyPlan(
  ownerId: string,
  initiativeId: string,
  args: { deadline: Date; topics: StudyTopic[]; researched: boolean },
): Promise<{ sessions: StudySession[]; taskCount: number }> {
  const sessions = generateStudyPlan({
    now: new Date(),
    deadline: args.deadline,
    topics: args.topics,
  });

  let created = 0;
  for (const s of sessions) {
    await createTask(ownerId, {
      name: `Study: ${s.topic}`,
      portfolio: "personal_dev",
      dueDate: s.date,
      source: "text",
      initiativeId,
    });
    created++;
  }

  await setStudyMeta(ownerId, initiativeId, {
    externalDeadline: args.deadline,
    knowledgeSource: args.researched ? "researched" : "document",
  });

  const first = sessions[0];
  if (first) {
    await setNextAction(ownerId, initiativeId, `Study: ${first.topic}`, first.date);
  }

  return { sessions, taskCount: created };
}
