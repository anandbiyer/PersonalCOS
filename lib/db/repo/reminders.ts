import { desc } from "drizzle-orm";
import { withOwner } from "@/lib/db";
import { reminderRules, audit, reminderSchedule, channel } from "@/lib/db/schema";

type ScheduleKind = (typeof reminderSchedule.enumValues)[number];
type ChannelKind = (typeof channel.enumValues)[number];

export interface CreateReminderRuleInput {
  target: string; // task/event id or free text
  schedule: ScheduleKind;
  scheduleConfig?: Record<string, unknown>;
  channel?: ChannelKind;
  nextFire: Date;
}

export async function createReminderRule(ownerId: string, input: CreateReminderRuleInput) {
  return withOwner(ownerId, async (tx) => {
    const [row] = await tx
      .insert(reminderRules)
      .values({
        ownerId,
        target: input.target,
        schedule: input.schedule,
        scheduleConfig: input.scheduleConfig ?? null,
        channel: input.channel ?? "web_push",
        nextFire: input.nextFire,
        active: true,
      })
      .returning();
    await tx.insert(audit).values({ ownerId, changeType: "reminder.created", newValue: row });
    return row;
  });
}

export async function listReminderRules(ownerId: string) {
  return withOwner(ownerId, async (tx) =>
    tx.select().from(reminderRules).orderBy(desc(reminderRules.createdAt)),
  );
}
