import { and, gte, lte } from "drizzle-orm";
import { withOwner } from "@/lib/db";
import { events, audit } from "@/lib/db/schema";

export interface CreateEventInput {
  date: Date;
  type?: string | null;
  status?: "planned" | "completed" | "cancelled";
  recurrence?: string | null;
}

export async function createEvent(ownerId: string, input: CreateEventInput) {
  return withOwner(ownerId, async (tx) => {
    const [row] = await tx
      .insert(events)
      .values({
        ownerId,
        date: input.date,
        type: input.type ?? null,
        status: input.status ?? "planned",
        recurrence: input.recurrence ?? null,
      })
      .returning();
    await tx
      .insert(audit)
      .values({ ownerId, changeType: "event.created", newValue: row });
    return row;
  });
}

export async function listEvents(ownerId: string, from: Date, to: Date) {
  return withOwner(ownerId, async (tx) =>
    tx
      .select()
      .from(events)
      .where(and(gte(events.date, from), lte(events.date, to))),
  );
}
