import { config } from "dotenv";
config({ path: ".env.local" });
config();

import postgres from "postgres";
import { ALL_TABLES } from "./tables";

/**
 * Pre-deploy guard: assert every table is empty. Run against the deployment's
 * DATABASE_URL before the final GitHub push / Vercel deploy to confirm no
 * demo/test data is present. Exits non-zero if any table has rows.
 */
async function main() {
  const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("No database URL set.");
  const sql = postgres(url, { max: 1 });
  try {
    const nonEmpty: { table: string; rows: number }[] = [];
    for (const t of ALL_TABLES) {
      const [{ count }] = await sql.unsafe<{ count: string }[]>(
        `SELECT count(*)::int AS count FROM "${t}"`,
      );
      const rows = Number(count);
      if (rows > 0) nonEmpty.push({ table: t, rows });
    }
    if (nonEmpty.length > 0) {
      console.error("✗ database is NOT empty — clean up before deploying:");
      for (const r of nonEmpty) console.error(`    ${r.table}: ${r.rows} rows`);
      process.exit(1);
    }
    console.log("✓ all tables empty — safe to deploy");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
