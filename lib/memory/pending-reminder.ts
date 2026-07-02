import { addFact, listFacts, deleteFact, INTERNAL_SUBJECT_PREFIX } from "@/lib/db/repo/facts";

/**
 * FR51 date slot-fill — the single, transient "awaiting a date" slot for a
 * reminder whose request carried no derivable date. Stored as an internal
 * (`sys:`) memory_facts row (owner-confirmed: no new table, RLS-for-free), so
 * it is hidden from context assembly and the Memory view. Single-slot + TTL'd;
 * cleared on completion, cancel, or expiry. Never durable knowledge.
 */
const SUBJECT = `${INTERNAL_SUBJECT_PREFIX}pending_reminder`;
const TTL_MS = 15 * 60 * 1000; // 15 minutes — a slot the manager didn't fill lapses

export interface PendingReminder {
  /** The thing to be reminded about, e.g. "Renew insurance". */
  subject: string;
  /** The original request text, kept for provenance. */
  message: string;
}

/** Remember that we asked for a date (replaces any prior pending slot). */
export async function setPendingReminder(ownerId: string, data: PendingReminder): Promise<void> {
  await clearPendingReminder(ownerId); // single-slot
  await addFact(ownerId, {
    kind: "commitment",
    subject: SUBJECT,
    value: JSON.stringify(data),
    neverExpire: false, // transient — must never be treated as durable knowledge
  });
}

/** The live pending slot, or null if none / expired (expiry clears it). */
export async function getPendingReminder(
  ownerId: string,
  now: Date = new Date(),
): Promise<PendingReminder | null> {
  const rows = (await listFacts(ownerId, { activeOnly: true, includeInternal: true })).filter(
    (r) => r.subject === SUBJECT,
  );
  const row = rows[0]; // most-recent first (updatedAt desc)
  if (!row) return null;
  if (now.getTime() - new Date(row.createdAt).getTime() > TTL_MS) {
    await clearPendingReminder(ownerId);
    return null;
  }
  try {
    return JSON.parse(row.value) as PendingReminder;
  } catch {
    await clearPendingReminder(ownerId);
    return null;
  }
}

/** Drop the pending slot (hard-delete — it's plumbing, not user knowledge). */
export async function clearPendingReminder(ownerId: string): Promise<void> {
  const rows = (await listFacts(ownerId, { includeInternal: true })).filter(
    (r) => r.subject === SUBJECT,
  );
  for (const r of rows) await deleteFact(ownerId, r.id);
}
