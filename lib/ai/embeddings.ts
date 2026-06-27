import { openai, openaiEnabled } from "./openai";

/**
 * Embeddings for FR13 vector search. OpenAI text-embedding-3-small produces
 * 1536-dim vectors, matching the pgvector column. No-op (null) when no key is
 * configured, so capture/search degrade gracefully to structured search.
 */
export const EMBED_MODEL = "text-embedding-3-small";
export const EMBED_DIM = 1536;

export function embeddingsEnabled(): boolean {
  return openaiEnabled();
}

export async function embed(text: string): Promise<number[] | null> {
  if (!openaiEnabled()) return null;
  try {
    const res = await openai().embeddings.create({
      model: EMBED_MODEL,
      input: text,
    });
    return res.data[0]?.embedding ?? null;
  } catch {
    // Never let an embedding failure break capture/search (NFR-4).
    return null;
  }
}
