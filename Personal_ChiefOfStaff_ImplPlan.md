# Personal Chief of Staff — Implementation Plan

> Derived from **CLAUDE_CODE_BRIEF.md**, **Requirements Spec v2.4**, **Design Document v1.2**, and **Mockup_FINAL.html**.
> Status: **PLAN ONLY — no implementation has started.** Awaiting confirmation.

---

## 0. Reconciliation & key decisions

A few things in the source docs need a stated interpretation before coding:

| Topic | Source tension | Decision for this plan |
|---|---|---|
| Single vs multi-user | Design v1.2 intro says "single-user, no multi-tenancy"; but Requirements v2.4 (R8), the data model, and the CLAUDE_CODE_BRIEF all specify a **two-user household** with Clerk + RLS. | Build the **two-tenant household** version. It is the latest revision and the brief's guardrails depend on it. Multi-tenancy lands in **Phase 5** (after the single-user vertical slices prove out), per the brief's build order. |
| Capture channel for MVP | Spec mentions Telegram as primary fast path. | Build **in-app multi-modal capture** (text/voice/image) first; Telegram webhook is added in Phase 4 (reminders) / Phase 6 (connectors). |
| Office confidentiality on Vercel | Spec wants office connectors local-only; Vercel is cloud. | Office portfolio is **coded-reference-only, no third-party connector** by default. Local connectors (Obsidian/memory) reached via secured tunnel are a later, optional enhancement (Phase 6). |
| STT provider | "Whisper-class STT" | Use a hosted STT endpoint via `STT_API_KEY` (provider-agnostic wrapper in `lib/ai`). |

**Authoritative model line:** latest Claude models (e.g. Opus 4.8 / Sonnet 4.6 / Haiku 4.5) via the Anthropic API, with portfolio-aware routing (NFR-2). Vision via Claude.

---

## 1. Target architecture (at a glance)

- **Next.js (App Router, TypeScript, strict)** on Vercel — UI (RSC) + API route handlers.
- **Tailwind CSS + shadcn/ui** — reproduce the bright mockup exactly (design tokens below).
- **Drizzle ORM + Vercel Postgres / Neon (pgvector + RLS)** — durable ledger, vector search, tenant isolation on `owner_id`.
- **Clerk** auth — individual users (email / Google / passkey), **not Organizations**; webhook syncs users → DB.
- **Vercel Cron** — brief, reminders, sweep, initiative-review, revalidate.
- **Vercel Blob** — captured images before Vision.
- **Anthropic API** — classify / advise / Vision; **STT** for voice.
- **TanStack Query** — client caching + optimistic updates.
- **Notifications** — Web Push (VAPID) primary; Pushover / Telegram / email per user.
- **MCP connector layer** — Calendar/Gmail/Drive, memory, notes, fetch, approval-gated browser, official Robinhood (read-only).

### Project structure
```
app/
  (views)/brief, consult, tasks, invest, calendar, waiting,
          reports, initiatives, people, inbox        # mockup views
  api/
    capture/route.ts        advisory/route.ts        consult/route.ts
    tasks/...  initiatives/...  handoff/...  reminders/...
    telegram/route.ts                                # webhook (later)
    clerk-webhook/route.ts                           # user sync
    cron/brief/route.ts     cron/reminders/route.ts
    cron/sweep/route.ts     cron/initiative-review/route.ts
    cron/revalidate/route.ts
lib/
  db/       # drizzle schema, migrations, RLS helpers, tenant context
  ai/       # anthropic client, classify, advise, vision, stt, routing
  mcp/      # connector registry, trust tier, scope enforcement
  auth/     # clerk helpers, session → owner_id
  notify/   # web-push, pushover, telegram, email dispatchers
  planner/  # weekly template, capacity scheduler, backward-planning
components/ # ui primitives derived from the mockup
vercel.json # cron schedules
```

---

## 2. Data model (Drizzle schema)

Every table carries `owner_id` + `created_at` + `updated_at`. RLS policies on `owner_id` enforce isolation. `invitations` is the **only** cross-tenant row.

| Table | Key columns |
|---|---|
| `users` | id, clerk_id, display_name, channels (web-push/pushover/telegram/email), timezone, **theme** (`aurora` \| `sunrise`, default per user) |
| `tasks` | id, owner_id, name, portfolio, initiative_id, due_date, priority, status, effort_min, recurrence, depends_on[], owner/stakeholder, source (text\|voice\|image), notes, completed_at |
| `initiatives` | id, owner_id, name, portfolio, stage, outcome, heartbeat, next_action, next_review, knowledge_source, external_deadline, readiness, stalled |
| `people` | id (coded), owner_id, role, initiatives[], behaviour_to_enable, last_nudge, motivators, notes |
| `decisions` | id, owner_id, context, alternatives, choice, reasoning, initiative_id, task_ids[] |
| `events` | id, owner_id, date, type, status, recurrence |
| `schedule_exceptions` | id, owner_id, date, overridden_block, replacement, source |
| `audit` | id, owner_id, ts, change_type, prev_value, new_value, action_taken, approval_state, trust_tier |
| `embeddings` | id, owner_id, entity_type, entity_id, vector (pgvector) |
| `invitations` | id, sender_id, recipient_id, title, due_date, note, status (pending/accepted/declined) — **cross-tenant** |
| `reminder_rules` | id, owner_id, target, schedule (one-off/daily/every-N-hrs/cron), channel, next_fire, active |

**Data-level invariant:** an initiative with stage in (Validated, In Dev, Piloted) and null `next_action` or `next_review` is flagged `stalled`.

**Task states:** Created → Planned → In Progress → Completed; with Overdue→Replanned, Blocked/Waiting, Delegated, Cancelled branches.
**Initiative stages:** Idea → Validated → In Dev → Piloted → Adopted (+ Stalled flag at any active stage).

---

## 3. Design tokens & per-user theming (FR39)

The app ships **two complete bright themes**, resolved per authenticated user from `users.theme` and applied as CSS custom properties via a `data-theme` attribute on the app shell. Switching is an attribute swap — **no component changes**. Theme is presentation-only and composes with RLS: each person sees only their own data, in their own palette. The mockup's demo-only user switcher previews both.

**Theme A — Aurora (User A / Anand):**
- Canvas `#F3F6FE`/`#F4F7FE` with soft radial colour washes.
- Portfolios: Office `#2D7FF9` · Personal Dev `#8B5CF6` · Personal Life `#13C296`.
- Gradients: hero `violet→pink`; CTA `blue→cyan`.

**Theme B — Sunrise (User B / wife) — bright Yellow / White / Orange:**
- Canvas `#FFFCF4` (warm near-white) + soft yellow/orange radial washes; surface `#FFFFFF`.
- Brand orange `#F97316` · bright yellow `#FFC400` · deep-orange accent `#EA580C`.
- Portfolios: Office `#EA580C` (deep orange) · Personal Dev `#E0A500` (gold/yellow) · Personal Life `#FB923C` (light tangerine).
- Soft fills: orange `#FFEAD6` · yellow `#FFF7D6` · tangerine `#FFF0E0`.
- Gradients: hero `yellow→orange` (`#FFC400→#F97316`); CTA `orange→amber` (`#F97316→#FFB02E`).
- Yellow used as a **fill** with darker text/icons so contrast meets WCAG AA on the light theme.

**Shared across both themes:**
- Attention semantics (constant meaning): amber `#FB9D2B` (waiting) · red `#F4496D` (overdue) · pink `#FB5E9D` (blocked) · cyan `#16C6E0`.
- Type: **Manrope** (UI) + **JetBrains Mono** (data/times). Radius 12–20px, soft colour-tinted shadows.
- Quality floor: responsive (sidebar collapses < 760px), `:focus-visible`, `prefers-reduced-motion`, WCAG AA contrast.
- IA: left nav grouped by the three systems + Household; pinned multi-modal capture bar on every screen; top bar with current date/time + context pill (dawn brief vs evening sweep).

> Implementation: define both palettes as token sets in `globals.css` (`:root[data-theme="aurora"]` / `[data-theme="sunrise"]`); set `data-theme` from the session user in the root layout. Only brand/portfolio/gradient/canvas tokens differ; component styles reference variables only.

---

## 4. Phased build plan

Each phase ends in a **demoable vertical slice**. Maps to the brief's build order and the spec's MVP cut.

### Phase 0 — Scaffold & foundations
- `create-next-app` (App Router, TS strict), Tailwind, shadcn/ui, ESLint/Prettier.
- Drizzle + Vercel Postgres/Neon wired; pgvector extension; first migration with **all tables + RLS policies** (RLS active from day one even while single-user).
- `lib/db` tenant-context helper (sets `owner_id` for the session); `lib/ai` Anthropic + STT client with portfolio routing stub.
- Env var scaffolding (`.env.example`), `vercel.json` placeholder, base layout reproducing the mockup shell (brand, top bar, left nav, pinned capture bar, canvas + tokens).
- **Theming foundation (FR39):** define both token sets (`aurora`, `sunrise`) in `globals.css` keyed by `data-theme`; build all components against CSS variables only. A dev theme toggle stands in until real per-user resolution lands in Phase 5.
- **Test foundation:** Vitest harness + Dockerised pgvector (non-superuser app role so RLS is genuinely tested), seed/cleanup/verify-empty tooling, and the requirements traceability matrix (`tests/REQUIREMENTS_TRACEABILITY.md`).
- **Tests (delivered):** NFR-7 (T-NFR7-01..05), FR39 (T-FR39-01..04), FR13/NFR-4 foundation, FR37/FR38 foundation, app-shell IA (T-SHELL-01/02) — 15 tests passing.
- **Exit:** app deploys to Vercel, shell renders in either theme via `data-theme`, migrations run, an empty ledger query respects RLS (**all proven by `npm run test:run`**).

### Phase 1 (MVP) — System of Record + capture  *(FR1–FR3, FR11–FR14, FR29; NFR-1/3/4/7)*
- **Multi-modal capture** end-to-end: text quick-add, voice → STT, image → Blob → Claude Vision.
- **Classifier**: portfolio (Office/Dev/Life) + **conversation-vs-actionable gate** (routes chat to consult, never auto-files).
- Write to ledger **with provenance**; office items stored as **coded references**.
- **Tasks ledger** view (status + provenance + portfolio chips), CRUD.
- **Search & retrieval**: structured + pgvector embeddings on write.
- **Audit trail** on every change. End-of-day **completeness sweep** prompt (manual trigger first).
- **Tests (delivered):** FR1, FR2 (+NFR-1 coded refs), FR3, FR11, FR12, FR13, FR14, FR29, NFR-6; Scenarios E & I — hermetic via `AI_OFFLINE=1`; real STT/Vision/embeddings/LLM validated by the live smoke test.
- **Exit:** ✅ capture by text/voice/image → classified (Claude or heuristic) → ledger with provenance; coded office refs; structured + vector search; nothing lost. (54 tests passing, build green.)

### Phase 2 — System of Action  *(FR4–FR7, FR10, FR23, FR25, FR28)*
- **Weekly template** + `schedule_exceptions`; deterministic capacity scheduler.
- **Calendar**: Day (hour grid fitted to template) + Week (agenda), colour-coded by portfolio; current date = default.
- **Reminders engine**: due/overdue detection, quiet-hours-aware (Family 20:00–21:00, Reading 21:15–22:00).
- **Waiting-on** tracking ("you owe" / "owed to you") with nudges.
- **Daily brief** as a synthesised artifact (morning + evening modes), the home hero.
- **Reports** view: completion rate, schedule variance, at-risk deadlines, portfolio health.
- **Tests (delivered):** FR4, FR6 (quiet hours), FR7, FR10, FR23, FR25, FR28 + Scenarios A, B, C, H — 20 planner tests passing. (FR5 capacity scheduling deferred to P3 with the initiative engine; notification dispatch to P4.)
- **Exit:** the day plans and reminds itself; calendar + brief + waiting-on all live. ✅ (build green, 46 tests passing.)

### Phase 3 — System of Judgment  *(FR15, FR16, FR9, FR20; anti-ideation invariant; FR33)*
- **Advisory loop**: situation → 2–3 options w/ trade-offs + reasoned pick → confirm → **operationalise** (decompose to tasks/initiative, link decision). Advisory overlay UI.
- **Initiatives board**: stage gates, heartbeat bar, **never-empty next action**, stalled flag surfaced in brief.
- **Study-plan generation** (backward-planned) + autonomous requirement research (FR20) for agent-researched goals.
- **Consult mode**: non-directive sounding-board chat, grounded in memory/decisions/people, **never auto-files** (opt-in capture only), exempt from anti-ideation invariant.
- **Tests (delivered):** FR15, FR16 (+ anti-ideation invariant), FR9, FR20, FR33, FR5 (study windows); Scenarios D, G, J — hermetic; advisory/consult/research LLM paths live-validated.
- **Exit:** ✅ advise → confirm → tracked initiative+task+decision across portfolios; stage gates enforce a never-empty next action; stalled surfaced in the brief; consult never files. (68 tests passing, build green.)

### Phase 4 — Cron, notifications & intelligence  *(FR6/7/8, FR17–FR19, FR21, FR22, FR24, FR25, FR26, FR27)*
- **Vercel Cron** routes (CRON_SECRET-protected): `cron/brief` 04:25, `cron/reminders` hourly, `cron/sweep` 21:45, `cron/initiative-review` weekly, `cron/revalidate` weekly.
- **Notification dispatchers**: Web Push (VAPID/PWA) primary; Pushover / Telegram / email; per-user channels; quiet hours.
- **People / enablement register** (FR19). Momentum/stall detection (FR17), notes-to-action (FR18).
- Slippage prediction (FR24), overload detection (FR22), approval-first execution + graduated trust (FR26), preference learning (FR27).
- **Tests (delivered):** cron auth (CRON_SECRET), FR6 quiet-hours dispatch, FR8 replanning (priority/dependency/deadline/capacity), FR17, FR18, FR19, FR22, FR24, FR26, FR27; Scenarios C, F — hermetic; cron/notify/notes LLM paths live-validated. FR21 light (flag+receipt; web re-check → P6).
- **Exit:** ✅ 5 CRON_SECRET-protected cron routes iterate all tenants and dispatch (Telegram/Pushover send; audit receipt always); quiet hours honoured (rituals exempt); stall/overload/slippage detection live; people register + notes extraction + approval gating. (83 tests passing, build green.)

### Phase 5 — Multi-user household  *(FR35, FR36, FR37, FR38; NFR-7/9)*
- **Clerk** auth (individual users, not Orgs); sign-in email/Google/passkey; **webhook syncs users → DB**.
- Harden **RLS** keyed on authenticated user id; verify a query for one user cannot return another's rows (isolation test suite).
- **Cross-user hand-off**: recipient picker in compose → `invitation` (sender's typed fields only) → recipient notified on **their** channels → Accept (copy-on-accept into recipient ledger) / Decline; sender sees only accept/decline status. **Inbox** view.
- **Scheduled/interval reminders** (FR38) via per-minute cron evaluating `reminder_rules`, dispatched per-tenant.
- **Per-user theme resolution (FR39):** read `users.theme` at session start and set `data-theme` from the authenticated identity — User A renders Aurora, User B renders Sunrise; the Phase 0 dev toggle is retired.
- **Tests (delivered):** FR35/36/37/38, FR39 per-user theme, NFR-9, Scenarios L & M — hermetic (hand-off, reminders, user-sync, RLS); Clerk provider/middleware/webhook + sign-in live-validated (sign-in 200). Real browser login = manual.
- **Exit:** ✅ Clerk auth wired (dev-tenant fallback when unconfigured) + webhook user sync; hand-off is a one-way consent-gated copy-on-accept (sender sees status only; third party blind); per-user interval reminders fire via per-minute cron to the right tenant; isolation proven. (99 tests passing, build green.) NFR-4 restore drill is an ops task at deploy.

### Phase 6 — MCP connectors & autonomy  *(FR30–FR32, FR34; NFR-8)*
- **MCP connector layer**: registry + trust tier + scope enforcement (directory/first-party only, read-only default).
- Memory (Mem0/Letta) FR30; Notes (Obsidian local / Notion) FR31; Fetch/web-search FR20/21; **approval-gated browser** FR32; Time.
- **Investments**: official **Robinhood MCP read-only** — value, holdings, day change, concentration; one-line brief summary; **no trading, no advice** (FR34). Investments view + read-only badge + not-connected empty state.
- Office portfolio: **local connectors only / coded-reference-only**; no payments by any connector.
- **Tests (delivered):** FR34 (read-only allowlist blocks all trading tools + status mapping + encrypted token + RLS), FR31 (Notion + office guard), FR20/21 (Tavily wired), NFR-2/NFR-8 (office→cloud refused); Scenario K — hermetic; Notion/connect live-validated. FR30 covered by Postgres; **FR32 browser automation deferred** (Could; needs hosted browser).
- **Exit:** ✅ connector layer with trust/scope policy + AES-256-GCM encrypted per-user tokens (RLS-scoped); Robinhood **read-only** portfolio on `/investments` with the allowlist proven to block every order tool; Tavily upgrades research to live web; Notion notes (personal/dev only, office stays Postgres); office confidentiality preserved. (110 tests passing, build green.) Real Robinhood portfolio read = manual (one-time OAuth token).

---

## 5. Mockup views → modules checklist

| View (mockup) | Module | Phase |
|---|---|---|
| Daily Brief (hero prose + focus list + glance row) | `/brief` | 2 |
| Consult (sounding-board chat) | `/consult` | 3 |
| Investments (read-only) | `/investments` | 6 |
| Tasks ledger | `/ledger` | 1 |
| Waiting-on | `/reminders` | 2 |
| Calendar (Day/Week) | `/planner` | 2 |
| Initiatives board | `/initiatives` | 3 |
| Reports | reporting | 2 |
| People (enablement register) | `/people` | 4 |
| Inbox (hand-offs) | `/handoff` | 5 |
| Advisory overlay | `/advisory` | 3 |
| Pinned capture bar (text/voice/image) | `/capture` | 1 |

---

## 6. Testing strategy (woven per phase)

Tests are written **with the phase that builds the requirement**, not in a separate final pass. Coverage is tracked in **`tests/REQUIREMENTS_TRACEABILITY.md`** — every FR/NFR and every Scenario (A–M) maps to test IDs, the delivering phase, and a status.

- **Harness:** Vitest. DB-backed tests run against a Dockerised **pgvector** instance (`npm run db:up`) connecting as a **non-superuser role** so Postgres RLS is genuinely exercised (superusers bypass RLS).
- **Layout:** `tests/phase<N>/*.test.ts`; shared helpers in `tests/helpers/`. Run with `npm run test:run` (CI) or `npm test` (watch).
- **Per phase:** each phase's "Tests" bullet lists the requirements it must cover; flip their status to ✅ in the matrix when they pass.
- **Always-on:** the RLS isolation suite (`phase0/rls.test.ts`) runs every CI pass so tenant isolation can never silently regress; `npm run build` must stay green.
- **Phase 0 delivered:** 15 tests passing (RLS isolation incl. fail-closed + WITH CHECK, schema, theming, IA scaffold).

### Regression (every phase)

- Every phase's CI runs the **entire accumulated suite** (`npm run test:run`). A phase cannot land with any prior-phase test red — that is the regression gate.
- **Cross-phase invariant guards** live in `tests/regression/` and run forever once added (not tied to one phase): tenant isolation (RLS), never-empty next action, coded office references (NFR-1), no connector executes payments, investments read-only, consult never auto-files, quiet-hours suppression, capture never silently fails.
- When a phase changes shared surfaces (schema, capture, auth, theming), it must add/extend the relevant regression guard so the behaviour is locked going forward.
- Hermetic by default: tests use the heuristic/stub paths so they pass **without external keys**; key-dependent behaviour is tested behind a guard that skips when the key is absent (and runs in CI where keys are set).

### LLM keys & external services — when to provision

| Service | Needed by | Without it |
|---|---|---|
| Anthropic (`ANTHROPIC_API_KEY`) | Phase 1 | Heuristic classification + text capture still work; no Vision |
| STT (`STT_API_KEY`) | Phase 1 | Voice modality disabled |
| Vercel Blob (`BLOB_READ_WRITE_TOKEN`) | Phase 1 | Image modality disabled |
| `CRON_SECRET`, `VAPID_*`, `TELEGRAM_*`, `PUSHOVER_*` | Phase 4 | No scheduled/push notifications |
| Clerk (`CLERK_*`, `CLERK_WEBHOOK_SECRET`) | Phase 5 | Dev tenant stub instead of real sign-in |
| Robinhood MCP + embeddings provider | Phase 6 | No investments view; vector search deferred |

## 7. Pre-deploy data cleanup (required before final GitHub push / Vercel deploy)

Demo/seed/test data must never ship to production. Tooling:

- `npm run db:seed` — load two demo tenants (Anand/aurora, Spouse/sunrise) for local preview.
- `npm run db:cleanup` — truncate all tables (guarded; requires `ALLOW_DB_CLEANUP=true`).
- `npm run db:verify-empty` — **CI/pre-deploy gate**: exits non-zero if any table has rows.

**Checklist before push & deploy:**
1. `npm run test:run` green.
2. `npm run build` green.
3. `npm run db:verify-empty` passes against the deployment's `DATABASE_URL` (clean up first if not).
4. Confirm secrets are not committed (`.env*`, seed data are gitignored).

## 8. Guardrails (do not violate — carried verbatim from the brief)

- Tenant isolation via **Postgres RLS on `owner_id`** — never app-layer filtering alone.
- Clerk = **individual users, NOT Organizations**; Clerk holds only login identity, all data in our Postgres.
- **Hand-off is the only cross-tenant object** — copy-on-accept, sender's typed fields only; sender sees accept/decline only.
- Notification channels are **per-user**; a reminder reaches exactly one tenant.
- Office items stored as **coded references** (retained — live-validated: "Acme Corporation" → "Client A").
- ~~Office portfolio uses local connectors only~~ — **DEVIATION (owner-approved, 2026-06-18):** cloud AI (Claude/OpenAI) is permitted for **all** portfolios including office, relaxing NFR-2's "office → local/third-party-cloud-never" for AI processing. Coded-reference *storage* (NFR-1) is kept. A global `AI_OFFLINE=1` switch disables all cloud AI when desired.
- **No connector executes payments** — remind & track only (e.g. LIC).
- **Investments read-only** — Robinhood official MCP, read scope; no orders, no funded agentic account, no buy/sell advice.
- **Consult never auto-files** — capture only on explicit yes.
- **Never-empty next action** — stalled initiatives surfaced in the brief.
- **All state in Postgres** (serverless: no memory, ephemeral FS); images → Blob.
- Notifications to **personal channels only**; honour quiet hours.

---

## 9. Conventions

TypeScript strict · Drizzle migrations · API as route handlers · cron protected by `CRON_SECRET` · long advisory/research runs streamed or queued (never block one request) · design tokens from the mockup · responsive + `:focus-visible` + `prefers-reduced-motion`.

## 10. Env vars
```
ANTHROPIC_API_KEY=   DATABASE_URL=   BLOB_READ_WRITE_TOKEN=
CLERK_SECRET_KEY=   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=   CLERK_WEBHOOK_SECRET=
VAPID_PUBLIC_KEY=   VAPID_PRIVATE_KEY=
TELEGRAM_BOT_TOKEN=   PUSHOVER_TOKEN=   PUSHOVER_USER=   STT_API_KEY=
CRON_SECRET=
```

## 11. Suggested first step (on your go-ahead)
Phase 0 + the **capture → classify → ledger** vertical slice (Phase 1 core), end to end — the brief's explicit "Start here."
