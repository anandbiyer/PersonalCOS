import { config } from "dotenv";
config({ path: ".env.local" });
config();

import postgres from "postgres";
import { ALL_TABLES } from "./tables";

/**
 * Remove ALL rows from every table. Used by:
 *   - test teardown (imported directly — no guard), and
 *   - the pre-deploy cleanup step (CLI — guarded).
 *
 * IMPORTANT (pre-deploy): demo/seed/test data must be cleaned up before the
 * final GitHub push and Vercel deployment so production never ships with it.
 * See README "Pre-deploy checklist".
 */
export async function truncateAll(adminUrl?: string): Promise<void> {
  const url =
    adminUrl ?? process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("No database URL available for cleanup.");
  const sql = postgres(url, { max: 1 });
  try {
    await sql.unsafe(
      `TRUNCATE ${ALL_TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
    );
  } finally {
    await sql.end();
  }
}

// ---- CLI entrypoint (guarded) -------------------------------------------
const isCli = process.argv[1]?.includes("cleanup");
if (isCli) {
  if (process.env.ALLOW_DB_CLEANUP !== "true") {
    console.error(
      "Refusing to truncate. This is destructive.\n" +
        "Re-run with ALLOW_DB_CLEANUP=true set, targeting the intended DATABASE_URL.\n" +
        "  PowerShell:  $env:ALLOW_DB_CLEANUP='true'; npm run db:cleanup\n" +
        "  bash:        ALLOW_DB_CLEANUP=true npm run db:cleanup",
    );
    process.exit(1);
  }
  truncateAll()
    .then(() => {
      console.log("✓ all tables truncated");
      process.exit(0);
    })
    .catch((err) => {
      console.error("✗ cleanup failed:", err);
      process.exit(1);
    });
}
