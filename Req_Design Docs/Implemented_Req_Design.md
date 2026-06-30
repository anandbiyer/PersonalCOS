# Implemented Requirements & Design

Reconciles the authoritative source documents against what is **actually built and deployed**.

**Sources:**
- `PersonalChiefOfStaff_Requirements_FINAL_v2.4.docx` (functional + non-functional requirements; FR/NFR IDs)
- `PersonalChiefOfStaff_Design_FINAL_v1.2.docx` (architecture, data model, flows, deployment)
- `tests/REQUIREMENTS_TRACEABILITY.md` (per-phase test coverage — basis for the statuses below)
- `UAT.md` (new requirements raised during user acceptance testing)

**Build state:** Phases 0–6 complete; 119 hermetic tests passing; deployed to **Vercel** (https://personal-cos.vercel.app) on **Neon Postgres** with per-user **Clerk** auth.

**Status legend:** ✅ Implemented · 🟡 Partial / foundation (noted) · ⬜ Deferred / not built

---

## 1. Functional Requirements — implementation status

| FR | Requirement | In original spec? | Status | Where / how implemented |
|----|-------------|-------------------|--------|--------------------------|
| FR1 | Natural-language task capture | Yes | ✅ | `lib/capture/ingest.ts` → ledger with provenance; never silently fails (NFR-6) |
| FR2 | Auto classification (portfolio) | Yes | ✅ | `lib/ai/classify.ts` — Claude when keyed, heuristic fallback |
| FR3 | Goal & initiative management | Yes | ✅ | `lib/db/repo/initiatives.ts`; stage gates in Phase 3 |
| FR4 | Calendar-aware planning (template + exceptions) | Yes | ✅ | `lib/planner/template.ts`, `schedule_exceptions` |
| FR5 | Capacity-based scheduling | Yes | ✅ | folded into study-plan scheduler (`lib/planner/study.ts`) |
| FR6 | Reminder engine, quiet-hours aware | Yes | ✅ | `lib/planner/reminders.ts` + `quiet-hours.ts`; dispatch via cron (Phase 4) |
| FR7 | Missed-task detection | Yes | ✅ | `overdueTasks` / `dueToday` (`lib/planner/reminders.ts`) |
| FR8 | Automatic replanning (priority/dependency/deadline/capacity) | Yes | ✅ | `lib/planner/replan.ts`, `/api/replan` |
| FR9 | Study-plan generation (backward-planned) | Yes | ✅ | `lib/initiatives/study-plan.ts` |
| FR10 | Weekly & monthly reporting | Yes | ✅ | `lib/reports/metrics.ts`, `/reports` |
| FR11 | Persistent ledger + CRUD | Yes | ✅ | `lib/db/repo/tasks.ts` + audit |
| FR12 | Decision repository | Yes | ✅ | `lib/db/repo/decisions.ts` |
| FR13 | Search & retrieval (structured + vector) | Yes | ✅ | pgvector embeddings + structured fallback |
| FR14 | Audit trail | Yes | ✅ | `audit` table written on every change |
| FR15 | Advisory mode (options → reasoned pick → operationalise) | Yes | ✅ | `lib/advisory/*`, `/api/advisory` |
| FR16 | Initiatives: stage gates + never-empty next action | Yes | ✅ | `lib/initiatives/invariant.ts`; stalled surfaced in brief |
| FR17 | Momentum / stall detection | Yes | ✅ | `recomputeStalled`; `cron/initiative-review` |
| FR18 | Notes-to-action extraction | Yes | ✅ | `lib/judgment/notes.ts` |
| FR19 | People / enablement register | Yes | ✅ | `lib/db/repo/people.ts`, `/people` |
| FR20 | Autonomous requirement research | Yes | ✅ | `lib/advisory/research.ts` (LLM; live web via Tavily) |
| FR21 | Knowledge re-validation cadence | Yes | 🟡 | `cron/revalidate` flags + receipt; live web re-check via Tavily when keyed |
| FR22 | Overload & conflict detection | Yes | ✅ | `lib/planner/overload.ts`, `/reports` |
| FR23 | Waiting-on tracking + nudge age | Yes | ✅ | `categorizeWaiting`, `/waiting` |
| FR24 | Slippage / deadline-risk prediction | Yes | ✅ | `lib/reports/slippage.ts`, `/reports` |
| FR25 | Daily briefing artifact (AM plan / PM sweep) | Yes | ✅ | `lib/brief/compose.ts` + LLM narration (`/api/brief/narrate`) |
| FR26 | Approval-first execution + graduated trust | Yes | ✅ | `lib/judgment/approvals.ts` |
| FR27 | Preference & estimation learning | Yes | 🟡 | `lib/judgment/learning.ts` (calibration utility; wiring to tracked durations later) |
| FR28 | Calendar day/week views | Yes | ✅ | `lib/planner/calendar.ts`, `/calendar` (client-rendered, device tz) |
| FR29 | Multi-modal capture (text/voice/image) + provenance | Yes | ✅ | `/api/capture`, `/voice`, `/image`; Blob + STT + Vision |
| FR30 | Persistent memory | Yes | ✅ | Postgres-backed (people/decisions/embeddings); Mem0 deferred |
| FR31 | Knowledge retrieval over own notes (Notion) | Yes | ✅ | `lib/connectors/notion.ts` (personal/dev only; office stays in Postgres) |
| FR32 | Approval-gated web action (browser) | Yes | ⬜ | Deferred (Could; needs a hosted browser) |
| FR33 | Conversation-vs-actionable gate + consult mode | Yes | ✅ | gate in `classify.ts`; consult never auto-files (`lib/consult/*`) |
| FR34 | Investment status (read-only) | Yes | ✅ | `lib/connectors/robinhood.ts` — hard read-only allowlist; `/investments` |
| FR35 | Multi-tenancy | Yes | ✅ | RLS on `owner_id`; Clerk id → owner |
| FR36 | Clerk auth — individual users, not Orgs | Yes | ✅ | `lib/auth`, `clerk-webhook`; dev-tenant fallback |
| FR37 | Cross-user hand-off (copy-on-accept) | Yes | ✅ | `invitations` (only cross-tenant row); `/inbox` |
| FR38 | Scheduled / interval reminders | Yes | ✅ | `reminder_rules` + per-minute `cron/fire-reminders` |
| FR39 | Per-user visual theme (aurora / sunrise) | Yes (Addendum v2.4.1) | ✅ | `data-theme` from authenticated user; `getCurrentTheme` |

---

## 2. New requirements implemented (NOT in the original ask — raised during UAT)

Flagged in the spec under **Addendum v2.4.2 — New Requirements based on UAT** and tracked in `UAT.md`.

| FR | Requirement | Status | Where / how |
|----|-------------|--------|-------------|
| FR40 | Natural-language due-date extraction at capture | ✅ | `lib/capture/extract-date.ts` — parses "by July 5", "7-8pm", "tomorrow", "friday", "in 3 days", ISO; sets `due_date` so dated captures hit the calendar. Deterministic (online == offline). |
| FR41 | Default 9pm deadline for date-only captures | ✅ | Date-only captures (bills/rent/CC) default to 21:00 (`DEFAULT_DUE_MINUTES`) as a timed "due by" rather than all-day. |
| FR42 | Device-timezone-aware dates | ✅ display / 🟡 reminders | Capture parses in the device's IANA tz; calendar, brief, tasks list, and reports render in the device tz (client components + `<LocalDate>`). Remaining: reminder/notification *scheduling* timing (cron-side, keyed on `users.timezone`). |

---

## 3. Deferred / not yet implemented

| Item | Requirement | Reason |
|------|-------------|--------|
| Browser automation | FR32 | "Could" priority; needs a hosted/approval-gated browser |
| Mem0 / Letta memory | FR30 (alt) | Postgres already backs persistent memory; external memory deferred |
| Web Push (VAPID) subscription UI | FR6/FR25 channel | Telegram/Pushover dispatch built; VAPID keys not provisioned in deployment |
| Backup & tested restore drill | NFR-4 | Ops task — Neon provides managed backups; restore drill to be run at go-live |
| Reminder scheduling in user tz | FR42 (remainder) | Notifications not yet enabled; will key on `users.timezone` when turned on |

---

## 4. Non-Functional Requirements

| NFR | Requirement | Status | Notes |
|-----|-------------|--------|-------|
| NFR-1 | Coded office references | ✅ | LLM-enforced at classify ("Acme" → "Client A"); storage stays coded |
| NFR-2 | LLM / connector data boundary | ✅ (with deviation) | Office never reaches third-party cloud **connectors** (`assertNotOffice`). **Owner-approved deviation (2026-06-18):** cloud AI (Claude/OpenAI) is permitted for **all** portfolios incl. office for AI *processing*; coded-reference storage (NFR-1) retained; global `AI_OFFLINE=1` disables all cloud AI |
| NFR-4 | Durable storage + backup/restore | 🟡 | Schema durable in Postgres; backup/restore is an ops task (Neon managed backups) |
| NFR-6 | Capture latency / no-friction | ✅ | Single ingest path; capture never silently drops |
| NFR-7 | Multi-tenant isolation via Postgres RLS | ✅ | `FORCE ROW LEVEL SECURITY` on every owner-scoped table; **verified on Neon** with a dedicated non-`BYPASSRLS` `pcos_app` role (see Design §3) |
| NFR-8 | Connector trust & scoping | ✅ | `assertNotOffice`; Robinhood read-only allowlist; encrypted per-user tokens |
| NFR-9 | Identity vs data separation | ✅ | Clerk holds login identity only; all data in Postgres; delete syncs |

---

## 5. Notable deviations from the original spec / design (all owner-approved)

1. **Single-user → two-tenant household.** Design v1.2 reads "single-user" in places; the build follows Requirements v2.4 — a **two-tenant household** with Clerk + RLS.
2. **Office confidentiality (NFR-2).** Original: office routes through local connectors only, never cloud. **Deviation:** cloud AI permitted for office *processing*; coded-reference *storage* kept; office still never sent to third-party cloud *connectors* (Tavily/Notion).
3. **Neon two-role database.** Neon's default `neondb_owner` carries `BYPASSRLS`, which would silently bypass tenant isolation. The deployment uses a dedicated non-`BYPASSRLS` `pcos_app` role for the app and `neondb_owner` for migrations only — a refinement discovered and proven during deploy.
4. **Timezone = device, rendered client-side (FR42).** Date-sensitive surfaces (calendar, brief, tasks, reports) render in the browser so each device shows its own local time, rather than a server/UTC or fixed `users.timezone` model.
5. **UI primitives.** Built as custom Tailwind v4 components faithful to the mockup, rather than shadcn/ui primitives named in the design doc.

---

## 6. Design followed (as built)

### 6.1 Architecture
Next.js (App Router, RSC, TS strict) on Vercel — one project for UI + API route handlers. Three conceptual systems over **one Postgres ledger**: System of Record (capture → ledger), System of Action (tasks/calendar/reminders/replan), System of Judgment (advisory/consult/approvals). Scheduled work runs as Vercel Cron → protected route handlers.

### 6.2 Technology stack (as deployed)
- **Framework:** Next.js 15 (App Router) · **Language:** TypeScript (strict)
- **UI:** React 19 + Tailwind CSS v4; custom components; TanStack Query provider
- **DB:** Neon Postgres + pgvector · **ORM:** Drizzle (migrations in `/drizzle`)
- **Auth:** Clerk (individual users) · **AI:** Anthropic (Claude) reasoning/vision/classify; OpenAI (STT + embeddings)
- **Storage:** Vercel Blob (capture images) · **Cron:** Vercel Cron (`vercel.json`)
- **Connectors:** MCP SDK (Robinhood read-only); Tavily + Notion via REST

### 6.3 Tenant isolation (NFR-7)
RLS on `owner_id` with `ENABLE` + `FORCE ROW LEVEL SECURITY` on all owner-scoped tables (`lib/db/rls.sql`). All tenant reads/writes go through `withOwner(ownerId, fn)` which sets `app.owner_id` for the transaction. Policies fail closed (no context → zero rows). `invitations` is the **only** cross-tenant row (sender OR recipient; copy-on-accept). On Neon, the app connects as non-`BYPASSRLS` `pcos_app` (pooled endpoint); migrations use `neondb_owner` (direct endpoint).

### 6.4 AI seams (degrade to deterministic)
`lib/ai/index.ts` provides the Anthropic client + `modelFor(portfolio, kind)` routing (Opus for reasoning/vision, Haiku for classify). `AI_OFFLINE=1` (`lib/ai/offline.ts`) switches every AI-touching module to deterministic fallbacks (heuristic classify, structured search, no-op STT/Vision/embeddings) — the basis for the hermetic test suite. Capture funnels all modalities through `ingestText` → classify → conversation gate → `createTask` (+ date extraction, FR40/41) → vector index.

### 6.5 Connector trust policy (NFR-8)
Cloud connectors serve personal/dev only; `assertNotOffice(portfolio, connector)` enforces the boundary. Per-user tokens are AES-256-GCM encrypted at rest (`lib/crypto`, `connector_tokens`, RLS-scoped). Robinhood talks to a full trading MCP server but every call passes `assertAllowed()` — a five-tool read allowlist plus a deny-pattern blocking any order/trade verb.

### 6.6 Auth & tenancy resolution
Clerk authenticates individual users; a webhook (`/api/clerk-webhook`, svix-verified) syncs users → Postgres `users`. `getCurrentOwnerId()` maps Clerk id → `users.id` (the RLS `owner_id`), falling back to a dev tenant when Clerk is unconfigured. `middleware.ts` gates all routes behind sign-in when `REQUIRE_AUTH=1` (keeping `/sign-in`, `/sign-up`, the Clerk webhook, and `/api/cron/*` public).

### 6.7 Frontend & theming (FR39)
Persistent app shell from the mockup (brand, top bar, left nav grouped by the three systems + household, pinned multi-modal capture bar). Two complete palettes — **aurora** (User A) and **sunrise** (User B) — applied via a `data-theme` attribute resolved from the authenticated user. Date/time-sensitive surfaces are client components so they reflect the viewer's device timezone (FR42), using a mount-gated `<LocalDate>` to avoid SSR/UTC flashes.

### 6.8 Deployment
GitHub (`anandbiyer/PersonalCOS`) → Vercel (region `iad1`) + Neon (`us-east-1`, co-located). Six `CRON_SECRET`-protected cron routes scheduled in `vercel.json`. Secrets: `DATABASE_URL` (pcos_app/pooled), `MIGRATE_DATABASE_URL` (neondb_owner/direct), `ANTHROPIC_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, `CLERK_*` (+ webhook secret). Pre-deploy gates: `npm run test:run`, `npm run build`, `npm run db:verify-empty`.

---

## 7. Design-document section → implementation map

| Design doc §  | Implementation |
|---------------|----------------|
| §3 System Architecture | Next.js RSC + route handlers; three-system module layout under `lib/` |
| §4 Technology Stack | As §6.2 above (Vercel-native; Neon instead of generic Vercel Postgres) |
| §5 Data Model & Schema | `lib/db/schema.ts` (Drizzle) — all entities + `owner_id` everywhere |
| §6 Application Modules | `app/(app)/*` views + `app/api/**` handlers |
| §7 Key Flows (capture, advisory, cron, calendar, consult, investments, hand-off, reminders) | All implemented; calendar/brief now client-rendered for tz |
| §8 Frontend Design (IA, tokens, quality floor) | App shell + two themes; responsive/`:focus-visible`/reduced-motion |
| §9 MCP Connector Layer | Robinhood (MCP), Tavily/Notion (REST); trust/scope policy |
| §10 Deployment to Vercel | Live on Vercel + Neon; `vercel.json` crons; env as above |
| §11 Security, Privacy & Confidentiality | RLS, coded office refs, encrypted connector tokens, no-payments guardrail |
