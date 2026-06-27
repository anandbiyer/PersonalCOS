import { sql } from "drizzle-orm";
import { withOwner } from "@/lib/db";
import { embeddings } from "@/lib/db/schema";

/** Vector index + search (FR13). All scoped by RLS via withOwner. */

export async function indexEntity(
  ownerId: string,
  entityType: string,
  entityId: string,
  vector: number[],
): Promise<void> {
  await withOwner(ownerId, async (tx) => {
    await tx.insert(embeddings).values({
      ownerId,
      entityType,
      entityId,
      embedding: vector,
    });
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
