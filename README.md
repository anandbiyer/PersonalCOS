# Personal Chief of Staff

Private, two-tenant (household) agent that manages **Office, Personal Development, and Personal Life** through one natural-language entry point — three layers working as one ledger: a System of Record, a System of Action, and a System of Judgment.

Built per `Req_Design Docs/` (Requirements v2.4, Design v1.2) and `Personal_ChiefOfStaff_ImplPlan.md`.

## Stack

Next.js (App Router, TS strict) · Tailwind CSS v4 · Drizzle ORM + Postgres (pgvector + Row-Level Security) · Clerk auth (individual users) · Anthropic API · Vercel Cron + Blob · Web Push / Pushover / Telegram.

## Status — Phases 0–6 complete (build phases done)

- **Phase 0:** app shell + two themes, Drizzle schema + RLS, DB/AI/auth seams, env + cron scaffolding.
- **Phase 1:** multi-modal capture — **text, voice (OpenAI STT), image (Blob + Claude Vision)** → classify (Claude, heuristic fallback) → ledger with provenance; conversation gate; tasks ledger + CRUD; audit; **coded office references**; **structured + vector search** (OpenAI embeddings); initiative/decision CRUD.
- **Phase 2:** weekly template + schedule exceptions; **calendar** day/week; **daily brief** (deterministic + LLM narration); **waiting-on**; **reminders** (overdue/due-soon, quiet-hours aware); **reports**. *(Notification dispatch → Phase 4.)*
- **Phase 3 (System of Judgment):** **advisory loop** (situation → options + reasoned pick → confirm → operationalise into initiative + task + decision); **initiatives board** with stage gates + the **anti-ideation invariant** (never-empty next action; stalled surfaced in the brief); **study-plan generation** + **autonomous requirement research** (FR20); **consult** sounding-board chat that never auto-files.
- **Phase 4 (Cron, notifications & intelligence):** five **CRON_SECRET-protected** Vercel Cron routes (brief / reminders / sweep / initiative-review / revalidate) iterating all tenants; **notification dispatch** (Telegram/Pushover send + audit receipt) honouring **quiet hours**; **automatic replanning** (FR8 — priority/dependency/deadline/capacity-aware, with a ledger action + daily-brief roll-forward); **stall/momentum**, **overload (what-to-drop)**, **slippage** detection; **people enablement register**; **notes-to-action**; **approval-first execution** with graduated trust.

- **Phase 5 (Multi-user household):** **Clerk** auth (individual users) with webhook **user-sync** to Postgres + dev-tenant fallback; **cross-user hand-off** (copy-on-accept — sender sees status only, recipient gets an independent task) with an Inbox + recipient picker; **per-user interval reminders** fired by a per-minute cron to the right tenant only; per-user theme from the authenticated user. RLS hardened so the recipient can accept/decline without seeing sender data.

- **Phase 6 (MCP connectors & read-only investments):** a **connector layer** with trust/scope policy + **AES-256-GCM-encrypted per-user tokens** (RLS-scoped); **Robinhood read-only investments** (`/investments`) with a **hard allowlist that blocks every order/trade tool**; **Tavily** web search upgrading research/re-validation (FR20/21); **Notion** second-brain notes (personal/dev only — office stays in Postgres). FR30 memory is Postgres-backed; browser automation (FR32) deferred.

**110 hermetic tests passing** (`AI_OFFLINE=1`) across Phase 0–6 + regression; real LLM/STT/Vision/embeddings/cron/hand-off/connectors validated via live smoke test. Cloud connectors degrade gracefully when unkeyed; set `AI_OFFLINE=1` to run fully offline.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev                  # http://localhost:3000
```

### Database (Postgres with RLS)

Local dev uses Dockerised **pgvector**. The app connects as a **non-superuser** role (`pcos_app`) so Row-Level Security is genuinely enforced — superusers and table owners bypass RLS, so testing as a restricted role is the only honest check.

```bash
npm run db:up                # start Dockerised pgvector (docker-compose.yml)
npm run db:generate          # regenerate ./drizzle SQL from lib/db/schema.ts
npm run db:migrate           # CREATE EXTENSION vector -> migrations -> lib/db/rls.sql
npm run db:seed              # load two demo tenants for local preview
npm run db:down              # stop the container
```

`db:migrate` uses `MIGRATE_DATABASE_URL` (superuser) for DDL; the app/tests use `DATABASE_URL` (restricted role).

### Tests

```bash
npm test                     # watch
npm run test:run             # one-shot (CI)
```

Vitest, with DB-backed tests against the local pgvector instance. Coverage and the per-phase plan live in **`tests/REQUIREMENTS_TRACEABILITY.md`** — tests are woven into each phase as it's built. Phase 0 ships 15 passing tests (RLS isolation, schema, theming, IA scaffold).

### Pre-deploy checklist (clean up test data first)

Demo/seed/test data must never ship to production. Before the final GitHub push / Vercel deploy:

1. `npm run test:run` — green
2. `npm run build` — green
3. `npm run db:verify-empty` — passes against the deployment `DATABASE_URL` (exits non-zero if any table has rows)
4. To wipe demo data: `ALLOW_DB_CLEANUP=true npm run db:cleanup` (PowerShell: `$env:ALLOW_DB_CLEANUP='true'; npm run db:cleanup`)
5. Confirm `.env*` and seed data are not committed (they're gitignored)

### Theming (FR39)

Two bright palettes selected per user. Preview locally with the dev toggle in the top bar, or set `DEV_THEME=sunrise` in `.env.local`. Per-user resolution from `users.theme` lands in Phase 5.

- **Aurora** (User A): blue / violet / green
- **Sunrise** (User B): yellow / white / orange

## Guardrails

Tenant isolation via Postgres RLS on `owner_id` (never app-layer filtering alone) · Clerk = individual users, not Orgs · hand-off is the only cross-tenant object · office items coded, local connectors only · no connector executes payments · investments read-only · consult never auto-files · never-empty next action · all state in Postgres.
