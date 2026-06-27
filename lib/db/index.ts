import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Single postgres.js client, reused across hot reloads in dev and across
 * warm serverless invocations in prod. All state lives in Postgres — the
 * serverless filesystem is ephemeral and there is no in-memory persistence.
 */
const globalForDb = globalThis as unknown as {
  __pcosClient?: ReturnType<typeof postgres>;
};

function makeClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and configure it.",
    );
  }
  // prepare:false plays nicer with serverless poolers (e.g. Neon/PgBouncer).
  return postgres(url, { max: 1, prepare: false });
}

export const client = globalForDb.__pcosClient ?? makeClient();
if (process.env.NODE_ENV !== "production") globalForDb.__pcosClient = client;

export const db = drizzle(client, { schema });

export { schema };

/**
 * Run a unit of work as a specific tenant. Sets `app.owner_id` for the
 * transaction so Postgres Row-Level Security returns only that owner's rows.
 *
 * Guardrail (NFR-7): never rely on app-layer filtering alone — every query
 * inside `fn` is physically constrained by RLS keyed on app.owner_id.
 */
export async function withOwner<T>(
  ownerId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.owner_id', ${ownerId}, true)`,
    );
    return fn(tx);
  });
}
