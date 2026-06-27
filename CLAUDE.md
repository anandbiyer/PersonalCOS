# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A private, two-tenant (household) "Personal Chief of Staff" — a Next.js (App Router, TS strict) agent that manages **Office, Personal Development, and Personal Life** through one natural-language capture entry point. Three conceptual layers over one Postgres ledger: a System of Record (capture → ledger), a System of Action (tasks/initiatives/calendar/reminders/replan), and a System of Judgment (advisory loop, consult, approvals).

Source of truth for behaviour: `Req_Design Docs/` (Requirements v2.4, Design v1.2) and `Personal_ChiefOfStaff_ImplPlan.md`. Code references requirements by ID (FR-n / NFR-n) in comments — those IDs map back to those docs. `README.md` has the phase-by-phase feature breakdown (Phases 0–6 complete).

## Commands

```bash
npm run dev              # Next dev server → http://localhost:3000
npm run build            # production build (must be green before deploy)
npm run lint             # next lint

npm test                 # vitest watch
npm run test:run         # one-shot (CI). Runs hermetically with AI_OFFLINE=1
npx vitest run tests/phase3/advisory.test.ts   # a single test file

# Database (local dev uses Dockerised pgvector)
npm run db:up            # start pgvector container (docker-compose.yml)
npm run db:generate      # regenerate ./drizzle SQL from lib/db/schema.ts
npm run db:migrate       # CREATE EXTENSION vector → drizzle migrations → lib/db/rls.sql
npm run db:seed          # load two demo tenants
npm run db:reset         # cleanup + seed
npm run db:studio        # drizzle-kit studio
npm run db:down          # stop container
npm run db:verify-empty  # asserts every table is empty (pre-deploy gate)
```

Tests are DB-backed and run against the live local pgvector instance sequentially (`fileParallelism: false`) — `npm run db:up` must be running. The suite force-sets `AI_OFFLINE=1` and strips AI keys, so tests always exercise deterministic fallbacks, never live LLM calls.

## Two database roles — this is load-bearing

The app and tests connect as a **non-superuser** role (`pcos_app`) via `DATABASE_URL`, because superusers and table owners *bypass* Row-Level Security. Testing isolation as a restricted role is the only honest check. DDL (migrations, cleanup) uses the superuser `MIGRATE_DATABASE_URL`. In managed Postgres (Neon/Vercel) the two URLs may be equal if the app role owns the schema.

## Core architecture

### Tenant isolation via Postgres RLS (NFR-7) — never filter by owner in app code alone
- Every owner-scoped table (`OWNER_SCOPED_TABLES` in `lib/db/schema.ts`) has an RLS policy keyed on the `app.owner_id` session var. Policies live in `lib/db/rls.sql`, applied last by the migrate runner.
- `withOwner(ownerId, fn)` (`lib/db/index.ts`) opens a transaction, `set_config('app.owner_id', …)`, then runs `fn`. **All tenant-scoped reads/writes go through this.** Queries are physically constrained by Postgres, not by a `WHERE owner_id =` you remembered to add.
- The **only** cross-tenant row is `invitations` (hand-off, FR37): visible to sender OR recipient, copy-on-accept (recipient gets an independent task; sender sees status only).

### Admin (RLS-bypassing) client — `lib/db/admin.ts`
Used **only** where there is no user session and every tenant must be enumerated: cron jobs and the Clerk→tenant user mapping. Cron iterates `listAllOwnerIds()` then processes each tenant under its own `withOwner` context via the shared `runCron` harness (`lib/cron/run.ts`) — one tenant's failure never aborts the others.

### Auth & tenant resolution — `lib/auth/index.ts`
Clerk authenticates individual **users** (not Organizations). `getCurrentOwnerId()` maps a verified Clerk id → `users.id` (the `owner_id` for RLS). When Clerk is unconfigured or there's no session, it **falls back to a dev tenant** (`DEV_OWNER_ID`), so local/dev/test runs work without auth. `middleware.ts` only attaches Clerk context when keys are present; it does not protect routes by default. Per-user theme (FR39: `aurora`/`sunrise`) also resolves here.

### AI seams — everything degrades to deterministic
- `lib/ai/index.ts`: Anthropic client + `modelFor(portfolio, kind)` routing. `MODELS.reasoning` = `claude-opus-4-8` (advisory, vision), `MODELS.fast` = Haiku (classify/routing). Office reasoning stays on the trusted first-party API.
- `lib/ai/offline.ts`: `aiOffline()` reads `AI_OFFLINE=1`. When offline, classify uses heuristics, search is structured (no embeddings), and STT/Vision/embeddings are no-ops. Every AI-touching module must have an offline path — tests depend on it.
- Capture pipeline: `lib/capture/ingest.ts` `ingestText()` is the shared path for **all** modalities. Voice (OpenAI STT) and image (Blob + Claude Vision) transcribe to text upstream, then call `ingestText` → classify → conversation-gate (FR33: conversational input is *not* filed) → `createTask` with provenance → `indexTask` for vector search.

### Connector trust policy (NFR-8) — `lib/connectors/`
Cloud connectors (Tavily, Notion, Robinhood) serve **personal/dev portfolios only**. Office content must never reach a third-party cloud connector — `assertNotOffice(portfolio, connector)` enforces this. Per-user connector tokens are AES-256-GCM-encrypted at rest (`lib/crypto/`, `connector_tokens` table, RLS-scoped).
- **Robinhood is read-only and must stay that way** (`lib/connectors/robinhood.ts`): it talks to a full *trading* MCP server but every call passes `assertAllowed()` — a hard allowlist of five read tools plus a deny-pattern regex blocking any `place/cancel/order/...` verb. Never widen this allowlist or call a trading tool.

### Layout & code layout
- `lib/db/repo/*` — repository functions per entity; they assume they run inside a `withOwner` transaction.
- `lib/{planner,brief,advisory,initiatives,judgment,reports,notify}/*` — domain logic, mostly pure/testable functions separated from the route handlers.
- `app/api/**/route.ts` — handlers resolve owner via `getCurrentOwnerId()`, then `withOwner`. Cron routes under `app/api/cron/*` are `CRON_SECRET`-protected via `cronAuthorized` and scheduled in `vercel.json`.
- `app/(app)/*` — the authenticated app UI (brief, tasks, calendar, initiatives, consult, people, reports, inbox, investments).
- Import alias: `@/*` → repo root.

## Guardrails (do not regress these)
- Tenant isolation is RLS on `owner_id`, never app-layer filtering alone.
- `invitations` is the only cross-tenant object; hand-off is copy-on-accept.
- Office items are coded references and stay in Postgres/local — never sent to a cloud connector.
- No connector executes payments; investments are read-only (allowlisted).
- Consult (sounding-board chat) never auto-files. Initiatives keep a never-empty next action (anti-ideation invariant).
- All state lives in Postgres — the serverless filesystem is ephemeral.

## Pre-deploy checklist (demo/seed data must never ship)
1. `npm run test:run` green · 2. `npm run build` green · 3. `npm run db:verify-empty` passes against the deploy `DATABASE_URL` · 4. wipe with `ALLOW_DB_CLEANUP=true npm run db:cleanup` (PowerShell: `$env:ALLOW_DB_CLEANUP='true'; npm run db:cleanup`) · 5. confirm `.env*` / seed data are gitignored.
