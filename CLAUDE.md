# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A private, two-tenant (household) "Personal Chief of Staff" — a Next.js (App Router, TS strict) agent that manages **Office, Personal Development, and Personal Life**. The primary interface is now **conversation-first**: the home screen is an ongoing daily session (`components/session-view.tsx`), and a single composer routes every message through an **orchestrator** (`lib/orchestrator/*`) that interprets intent, calls the right engine, replies, and remembers across days via a bounded conversation-memory subsystem (`lib/memory/*`). The older forms/screens remain as structured surfaces. Three conceptual layers over one Postgres ledger: a System of Record (capture → ledger), a System of Action (tasks/initiatives/calendar/reminders/replan), and a System of Judgment (advisory loop, consult, approvals).

Source of truth for behaviour: `Req_Design Docs/` — base **Requirements v2.4 / Design v1.2**, plus the **Conversational Upgrade & Conversation Memory** increment (`Revised_Req_Design_Conversational_Memory (1).md` = binding; `Revised_Imple_Plan.md`; `PersonalChiefOfStaff_Mockup_FINAL.html` = visual truth). Code references requirements by ID (FR-n / NFR-n) in comments. Base build = Phases 0–6; conversational/memory increment = Phases 1–8 (FR43–FR48, NFR-10/11), all complete and **deployed**. See **Current status** at the bottom.

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
- Capture pipeline: `lib/capture/ingest.ts` `ingestText()` is the shared path for **all** modalities. Voice (OpenAI STT) and image (Blob + Claude Vision) transcribe to text upstream, then call `ingestText` → classify → conversation-gate (FR33: conversational input is *not* filed) → `createTask` with provenance → `indexTask`. `lib/capture/extract-date.ts` is a pure, key-free, tz-aware parser that also runs offline: it extracts the **due date** (`extractDueDate` — incl. bare ordinals like "the 1st", compact times like "530pm", 9pm date-only default), the **duration** (`extractDurationMin`), and a **clean title** (`cleanTaskTitle` — strips scheduling verbs + date/time noise so the offline classifier files "Office call", not the raw sentence; the online Haiku classifier titles + codes office names itself).

### Conversational orchestrator (FR43) — `lib/orchestrator/*`
Every message hits `POST /api/orchestrator`: `buildContext` (bounded memory) → `routeIntent` (Haiku online / deterministic heuristic offline) → `act` (dispatch) → `composeReply` → persist turns + `extractFacts`. **Nine intents**: `task`, `calendar`, `completion`, `status`, `question` (consult, never files), `handoff` (confirm via Inbox), `reminder` (creates real reminder rules, quiet-hours-aware), `edit` (reschedule a matched task, audited), `delete` (soft-cancel = recoverable). `edit`/`delete`/`completion` share `matchOpenTask` (keyword fuzzy match; clarifies when unsure). `calendar` proposes a re-plan **only** on a real same-day timed clash (`overlapsExistingTimedTask`), else files silently. Confirmation scales with stakes. Rich engines (decisions, initiatives, advisory, reports, people/waiting, search) are built but reachable via their **screens/APIs**, not (yet) via chat — see `tests/UAT Test Cases/PersonalCOS_Test_Cases.md` §0 for the executability map.

### Conversation memory (FR46/47/48, NFR-10) — `lib/memory/*`
Tiered: **T1** verbatim turns (`conversation_turns`, time-boxed by `users.retention_days` 7–14), **T2** permanent day-summaries (`conversation_summaries`), **T3** durable `memory_facts` (never-expire) + ledger + embeddings. `buildContext` assembles ≤ `MEMORY_CONTEXT_TOKEN_CAP` (~3000): known facts + summary + ledger slice (excludes completed) + recent OPEN turns + conditional retrieval. `budget.ts` logs a per-turn `memory.turn_cost` audit row. **Retention (FR47)** is a nightly cron (`lib/memory/retention.ts`, `cron/retention`): deletes out-of-window/completion-pruned turns, archives (not deletes) old completed one-off tasks, rolls off old summaries — **never** touches facts/decisions/ledger (NFR-5). Completing a task flags its turns `prune_eligible` for early pruning. Session lifecycle (`lib/session/lifecycle.ts`): `openDaySession` (cron/brief) + `closeDaySession` (cron/sweep → `finalizeDaySummary`). Memory is inspectable/editable at `/memory` (delete a fact works; edit is API-only for now).

### Connector trust policy (NFR-8) — `lib/connectors/`
Cloud connectors (Tavily, Notion, Robinhood) serve **personal/dev portfolios only**. Office content must never reach a third-party cloud connector — `assertNotOffice(portfolio, connector)` enforces this. Per-user connector tokens are AES-256-GCM-encrypted at rest (`lib/crypto/`, `connector_tokens` table, RLS-scoped).
- **Robinhood is read-only and must stay that way** (`lib/connectors/robinhood.ts`): it talks to a full *trading* MCP server but every call passes `assertAllowed()` — a hard allowlist of five read tools plus a deny-pattern regex blocking any `place/cancel/order/...` verb. Never widen this allowlist or call a trading tool.

### Layout & code layout
- `lib/db/repo/*` — repository functions per entity; they assume they run inside a `withOwner` transaction.
- `lib/{planner,brief,advisory,initiatives,judgment,reports,notify}/*` — domain logic, mostly pure/testable functions separated from the route handlers.
- `app/api/**/route.ts` — handlers resolve owner via `getCurrentOwnerId()`, then `withOwner`. Cron routes under `app/api/cron/*` are `CRON_SECRET`-protected via `cronAuthorized` and scheduled in `vercel.json` (crons run in **UTC**).
- `app/(app)/*` — the authenticated app UI (brief=session home, tasks, calendar, waiting, reports, initiatives, consult, people, inbox, investments, memory). `components/app-shell.tsx` is an **async server component** that fetches live nav badge counts (`lib/nav/counts.ts`) and passes them to the client `Nav`; `components/nav.tsx` renders mockup line-icons + badges (open tasks / waiting / stalled initiatives / pending inbox).
- Import alias: `@/*` → repo root.
- **Adding an owner-scoped table requires updating THREE arrays in sync** — `OWNER_SCOPED_TABLES` (`lib/db/schema.ts`), the `owner_tables` loop (`lib/db/rls.sql`), and `ALL_TABLES` (`lib/db/tables.ts`). The data-driven schema test (RLS forced on every listed table) is the safety net; missing one = a silent isolation hole.

## Guardrails (do not regress these)
- Tenant isolation is RLS on `owner_id`, never app-layer filtering alone.
- `invitations` is the only cross-tenant object; hand-off is copy-on-accept.
- Office items are coded references and stay in Postgres/local — never sent to a cloud connector.
- No connector executes payments; investments are read-only (allowlisted).
- Consult (sounding-board chat) never auto-files. Initiatives keep a never-empty next action (anti-ideation invariant).
- All state lives in Postgres — the serverless filesystem is ephemeral.

## Deploy workflow (the app is LIVE — Vercel + Neon)
Production auto-deploys on push to **`main`** → `personal-cos.vercel.app`. Neon is the prod DB; secrets live in `prod-vercel.env` (gitignored: `PROD_DATABASE_URL` = `pcos_app` app role, `PROD_MIGRATE_DATABASE_URL` = `neondb_owner`, `CRON_SECRET`, `TOKEN_ENCRYPTION_KEY`). Deploy sequence:
1. `npm run test:run` green · `npm run build` green · working tree committed.
2. **Migrate Neon FIRST** (additive migrations are safe while old code runs): run drizzle migrate + `rls.sql` against `PROD_MIGRATE_DATABASE_URL`, **then GRANT the app role** on the new tables — `rls.sql` does NOT grant; `pcos_app` ≠ owner, so new tables need `GRANT SELECT,INSERT,UPDATE,DELETE … TO pcos_app` + `ALTER DEFAULT PRIVILEGES` (applied this session).
3. Merge → push `main` (triggers deploy). Vercel registers `vercel.json` crons on deploy.
4. Smoke-test the live URL (read-only GETs; `/brief` exercises the new memory tables) + check Vercel logs. Rollback = Vercel instant revert (additive migration needs no DB revert).

Note: `db:verify-empty` was the *first-deploy* gate (no seed data ships); it no longer applies now that prod holds real tenant data. Still confirm `.env*` / `prod-vercel.env` / seed are gitignored.

## Current status (activity log)
**Deployed and live.** `main` @ the retention-cron-schedule commit; Neon migrated through `0002` (5 memory tables + RLS + grants verified).

Conversational increment (Phases 1–8) shipped: data layer (5 tables + column alters), orchestrator (9 intents), memory core (context/facts/summary), conversation-first UI (session home + merged composer, voice/image retained), plan negotiation (propose→agree→commit), session lifecycle (open/sweep crons), retention (FR47) + Memory view (FR48), cost guardrails (NFR-10 token cap + per-turn audit).

Post-increment fixes & additions (all with tests; suite is **~204 green**):
- Today's-plan card shows **start–end time ranges**; timed tasks get an assumed 30-min duration (`DEFAULT_TASK_DURATION_MIN`).
- Stopped **spurious revised-plan** proposals — only propose on a real same-day timed clash.
- **Increment A** — conversational reminders (FR6/FR38) + quiet-hours changed to a single **21:00–06:00 night window** (`deferPastQuietHours`, server-local time).
- **Increment B** — conversational task **edit/delete** (FR11) + audited `updateTask` (covers FR14-T2).
- Time/title fixes: **bare-ordinal dates** ("the 1st"), **compact times** ("530pm"), **`cleanTaskTitle`** for offline capture.
- **Nav icons + live badge counts** (mockup parity).
- UAT: `tests/UAT Test Cases/` holds the test pack, a §0 executability assessment, results, and a `tests/uat/` harness.

Open follow-ups: **Robinhood connector** needs `ROBINHOOD_MCP_URL` set in Vercel + a per-user token POSTed to `/api/connectors/robinhood` (no connect UI yet); FR48 fact **edit** in the UI; several 🖥️/❌ chat-wiring gaps (decisions/initiatives/reports/people/search) documented in the UAT §0 tally. Quiet-hours + retention-cron timing are **server-local/UTC** (retention scheduled `30 7 * * *` = 03:30 EDT).
