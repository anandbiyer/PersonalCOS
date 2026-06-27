import { describe, it, expect, afterAll } from "vitest";
import { admin, closeDb } from "../helpers/db";
import { ALL_TABLES } from "@/lib/db/tables";

/**
 * Phase 0 — schema foundations.
 * Covers: NFR-4 (durable schema), FR11 (persistent ledger structure),
 * FR13 (pgvector retrieval column), FR39 (theme enum).
 */
describe("[P0] database schema", () => {
  afterAll(closeDb);

  it("creates all 11 tables (T-NFR4-01)", async () => {
    const rows = await admin<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'`;
    const names = rows.map((r) => r.table_name).sort();
    expect(names).toEqual([...ALL_TABLES].sort());
  });

  it("every owner-scoped table has owner_id (T-NFR7-01)", async () => {
    const ownerScoped = ALL_TABLES.filter(
      (t) => t !== "users" && t !== "invitations",
    );
    for (const t of ownerScoped) {
      const cols = await admin<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${t}`;
      expect(
        cols.map((c) => c.column_name),
        `${t} should have owner_id`,
      ).toContain("owner_id");
    }
  });

  it("embeddings uses a pgvector column (T-FR13-01)", async () => {
    const [col] = await admin<{ udt_name: string }[]>`
      SELECT udt_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='embeddings' AND column_name='embedding'`;
    expect(col?.udt_name).toBe("vector");
  });

  it("theme_name enum has aurora and sunrise (T-FR39-01)", async () => {
    const rows = await admin<{ label: string }[]>`
      SELECT e.enumlabel AS label
      FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'theme_name' ORDER BY e.enumsortorder`;
    expect(rows.map((r) => r.label)).toEqual(["aurora", "sunrise"]);
  });

  it("RLS is enabled AND forced on every table (T-NFR7-02)", async () => {
    const rows = await admin<
      { relname: string; rls: boolean; forced: boolean }[]
    >`
      SELECT relname, relrowsecurity AS rls, relforcerowsecurity AS forced
      FROM pg_class
      WHERE relkind='r' AND relnamespace='public'::regnamespace`;
    expect(rows.length).toBe(ALL_TABLES.length);
    for (const r of rows) {
      expect(r.rls, `${r.relname} RLS enabled`).toBe(true);
      expect(r.forced, `${r.relname} RLS forced`).toBe(true);
    }
  });
});
