import { sql } from "drizzle-orm";
import { withOwner } from "@/lib/db";
import { embeddings } from "@/lib/db/schema";

/** Vector index + search (FR13). All scoped by RLS via withOwner. */

export async function indexEntity(
  ownerId: string,
  entityType: string,
  entityId: string,
  vector: number[],
  /** Memory lifecycle tag (FR47/§4.7): turn|fact|summary. */
  source?: string,
): Promise<void> {
  await withOwner(ownerId, async (tx) => {
    await tx.insert(embeddings).values({
      ownerId,
      entityType,
      entityId,
      embedding: vector,
      source: source ?? null,
    });
  });
}

export interface MemoryHit {
  source: string;
  text: string;
}

/** Conditional memory recall (FR46 §4.4): nearest durable facts + day-summaries
 *  by vector, returning their text. RLS-scoped. */
export async function searchMemory(
  ownerId: string,
  vector: number[],
  limit = 5,
): Promise<MemoryHit[]> {
  const literal = `[${vector.join(",")}]`;
  return withOwner(ownerId, async (tx) => {
    const rows = await tx.execute<{ source: string; text: string }>(
      sql`SELECT e.source AS source,
                 COALESCE(f.value, s.summary_text) AS text
          FROM embeddings e
          LEFT JOIN memory_facts f ON e.source = 'fact' AND f.id = e.entity_id
          LEFT JOIN conversation_summaries s ON e.source = 'summary' AND s.id = e.entity_id
          WHERE e.source IN ('fact', 'summary')
          ORDER BY e.embedding <=> ${literal}::vector
          LIMIT ${limit}`,
    );
    return (rows as unknown as { source: string; text: string }[])
      .filter((r) => r.text)
      .map((r) => ({ source: r.source, text: r.text }));
  });
}

/** Nearest entity ids by cosine distance (pgvector `<=>`). */
export async function searchEntityIdsByVector(
  ownerId: string,
  entityType: string,
  vector: number[],
  limit = 20,
): Promise<string[]> {
  const literal = `[${vector.join(",")}]`;
  return withOwner(ownerId, async (tx) => {
    const rows = await tx.execute<{ entity_id: string }>(
      sql`SELECT entity_id FROM embeddings
          WHERE entity_type = ${entityType}
          ORDER BY embedding <=> ${literal}::vector
          LIMIT ${limit}`,
    );
    return (rows as unknown as { entity_id: string }[]).map((r) => r.entity_id);
  });
}
