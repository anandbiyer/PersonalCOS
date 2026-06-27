import { and, gte, lte } from "drizzle-orm";
import { withOwner } from "@/lib/db";
import { scheduleExceptions, audit } from "@/lib/db/schema";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export interface CreateExceptionInput {
  date: Date;
  overriddenBlock?: string | null;
  replacement?: string | null;
  source?: string | null;
}

export async function createException(ownerId: string, input: CreateExceptionInput) {
  return withOwner(ownerId, async (tx) => {
    const [row] = await tx
      .insert(scheduleExceptions)
      .values({
        ownerId,
        date: isoDate(input.date),
        overriddenBlock: input.overriddenBlock ?? null,
        replacement: input.replacement ?? null,
        source: input.source ?? null,
      })
      .returning();
    await tx
      .insert(audit)
      .values({ ownerId, changeType: "exception.created", newValue: row });
    return row;
  });
}

export async function listExceptions(ownerId: string, from: Date, to: Date) {
  return withOwner(ownerId, async (tx) =>
    tx
      .select()
      .from(scheduleExceptions)
      .where(
        and(
          gte(scheduleExceptions.date, isoDate(from)),
          lte(scheduleExceptions.date, isoDate(to)),
        ),
      ),
  );
}
