import { config } from "dotenv";
config({ path: ".env.local" });
config();

import postgres from "postgres";

/**
 * Seed two isolated demo tenants for local preview (Anand=aurora, wife=sunrise),
 * each with a couple of sample rows. Inserted THROUGH the app role with tenant
 * context so RLS WITH CHECK is exercised (rows can only be written for the
 * active owner).
 *
 * DEMO DATA ONLY — must be removed before deploy (npm run db:verify-empty).
 */
const USER_A = "00000000-0000-0000-0000-000000000001";
const USER_B = "00000000-0000-0000-0000-000000000002";

async function asOwner(
  sql: postgres.Sql,
  ownerId: string,
  fn: (tx: postgres.TransactionSql) => Promise<void>,
) {
  await sql.begin(async (tx) => {
    await tx`select set_config('app.owner_id', ${ownerId}, true)`;
    await fn(tx);
  });
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set (should be the app role).");
  const sql = postgres(url, { max: 1 });
  try {
    await asOwner(sql, USER_A, async (tx) => {
      await tx`INSERT INTO users (id, display_name, theme, timezone)
               VALUES (${USER_A}, 'Anand', 'aurora', 'Asia/Kolkata')
               ON CONFLICT (id) DO NOTHING`;
      await tx`INSERT INTO tasks (owner_id, name, portfolio, status, source)
               VALUES (${USER_A}, 'Client F — column inventory', 'office', 'planned', 'text')`;
      await tx`INSERT INTO initiatives (owner_id, name, portfolio, stage, outcome, next_action)
               VALUES (${USER_A}, 'AWS certification', 'personal_dev', 'validated',
                       'Pass the exam', 'Draft the backward study plan')`;
    });

    await asOwner(sql, USER_B, async (tx) => {
      await tx`INSERT INTO users (id, display_name, theme, timezone)
               VALUES (${USER_B}, 'Spouse', 'sunrise', 'Asia/Kolkata')
               ON CONFLICT (id) DO NOTHING`;
      await tx`INSERT INTO tasks (owner_id, name, portfolio, status, source)
               VALUES (${USER_B}, 'Plan Goa vacation', 'personal_life', 'planned', 'text')`;
    });

    console.log("✓ seeded demo tenants (Anand/aurora, Spouse/sunrise)");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("✗ seed failed:", err);
  process.exit(1);
});
