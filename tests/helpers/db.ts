import postgres from "postgres";
import { truncateAll } from "@/lib/db/cleanup";

/**
 * Test DB helpers.
 *  - `app`   connects as the NON-SUPERUSER role  -> RLS applies (the thing we test)
 *  - `admin` connects as the superuser           -> setup/teardown bypasses RLS
 */
const appUrl = process.env.DATABASE_URL!;
const adminUrl = process.env.MIGRATE_DATABASE_URL ?? appUrl;

export const app = postgres(appUrl, { max: 4 });
export const admin = postgres(adminUrl, { max: 2 });

// Stable tenant ids for tests.
export const OWNER_A = "00000000-0000-0000-0000-0000000000aa";
export const OWNER_B = "00000000-0000-0000-0000-0000000000bb";
export const OWNER_C = "00000000-0000-0000-0000-0000000000cc";

/** Run a unit of work as a given tenant (sets app.owner_id for RLS). */
export function asOwner<T>(
  ownerId: string,
  fn: (sql: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return app.begin(async (sql) => {
    await sql`select set_config('app.owner_id', ${ownerId}, true)`;
    return fn(sql);
  }) as Promise<T>;
}

export async function resetDb(): Promise<void> {
  await truncateAll(adminUrl);
}

export async function closeDb(): Promise<void> {
  await app.end({ timeout: 5 });
  await admin.end({ timeout: 5 });
}
