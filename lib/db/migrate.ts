import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

/**
 * Migration runner.
 *
 * Order matters:
 *   1. CREATE EXTENSION vector  — required before the embeddings table (which
 *      uses a vector column) is created.
 *   2. Drizzle migrations       — generated table DDL in ./drizzle.
 *   3. RLS policies             — lib/db/rls.sql (idempotent), applied last so
 *      tenant isolation is enforced on every owner-scoped table.
 */
async function main() {
  // Migrations need DDL + CREATE EXTENSION privileges -> use the superuser URL
  // when provided, falling back to DATABASE_URL (e.g. managed Postgres where
  // the app role has owner rights).
  const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Neither MIGRATE_DATABASE_URL nor DATABASE_URL is set. Configure .env.local first.",
    );
  }

  const sql = postgres(url, { max: 1 });
  try {
    console.log("→ ensuring pgvector extension");
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;

    console.log("→ applying drizzle migrations");
    const db = drizzle(sql);
    await migrate(db, { migrationsFolder: "./drizzle" });

    console.log("→ applying RLS policies");
    const rls = readFileSync(join(process.cwd(), "lib", "db", "rls.sql"), "utf8");
    await sql.unsafe(rls);

    console.log("✓ migrations complete");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("✗ migration failed:", err);
  process.exit(1);
});
