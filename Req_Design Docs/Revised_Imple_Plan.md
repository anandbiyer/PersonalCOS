# Revised Implementation Plan — Conversational Upgrade & Conversation Memory

Detailed activity list for the **FR43–FR48 / NFR-10–NFR-11** increment, built on the deployed app (Phases 0–6, 119 tests, live on Vercel + Neon + Clerk).

## Context

Today the app is *forms-and-screens*: a capture bar files, a Consult screen chats, a dashboard lists. The **final reconciled spec** — `Revised_Req_Design_Conversational_Memory (1).md` (binding; cross-checked in its §9 against **Requirements Spec v2.5**, **Design Document v1.3**, and `Implemented_Req_Design.md`) + `PersonalChiefOfStaff_Mockup_FINAL.html` (source of visual truth, NFR-11) — specifies a **conversation-first** model: one ongoing dialogue is the primary interface; the agent interprets each message, routes it to the right action (task/calendar/status/advice/handoff), replies like a chief of staff, negotiates re-plans, and remembers across days via a cheap, bounded, tenant-isolated **conversation-memory** subsystem. It **reuses the existing engine** (classify, ingest, advisory, replan, consult, reminders) as tools behind one orchestrator. Per §9.1, **FR43–FR48 numbering is authoritative**.

**Owner decisions for this build:** (1) **Direct replacement** — home becomes the session thread, the global capture bar merges into the session composer, matching the mockup 1:1. (2) **Full increment, phased** — 8 sequential phases (spec §7), each shippable/verifiable.

**Retention model (final, per FR47 / §4.6.1 — tiered lifecycle):** retention is **by type and state**, not one timer — (a) **verbatim turns** `users.retention_days` 7–14, default 7, + completion-pruning; (b) **completed one-off tasks** archive (≠ delete) at `users.completed_archive_months` (default 12); (c) **day-summaries** roll off at `users.summary_retention_months` (default 18); (d) **durable knowledge** (facts/decisions/people-notes/recurring commitments) **never expires** — timer-immutable, removable only by explicit user deletion. All windows owner-configurable, defaulted generous, framed as optional cost-hygiene (never a capability trade). The stale "3–12 mo / default 6 / `retention_months`" lines in §2.2/§7 are superseded by these §4.6.1 settings. Keep both themes (aurora/sunrise); reuse existing semantic tokens.

**NFR coverage in this build:** NFR-1/2 (coded + local-only office memory), **NFR-3** (memory tables encrypted at rest like all data — Neon-managed; no app-layer change; durable layers hold only coded text), **NFR-5** (durable knowledge never expires; completed tasks **archive, not delete**, ~12 mo; summaries roll off ~18 mo; verbatim 7–14 d; audit/history preserved), NFR-7 (RLS extends to all memory tables), NFR-10 (bounded cost), NFR-11 (binding UI).

## Architecture (target)

```
message → POST /api/orchestrator
  1. buildContext(owner) — bounded ≤~2–3k tokens (summary + last ~6 OPEN turns + ledger slice + conditional top-k retrieval)
  2. route intent (Haiku) → calendar | task | completion | status | question | handoff
  3. act — call existing module (ingest / replan-propose / advise / setStatus / handoff / reminder)
  4. reply (Haiku) — NL + follow-up
  5. persist turn + write-before-compaction fact extraction (Haiku, piggy-backed)
  → returns { reply, actions[], plan? }
```
Memory tiers: **T1** working (rolling summary + last ~6 turns), **T2** day-summaries, **T3** ledger + durable `memory_facts` + embeddings. **Tiered retention (NFR-5): durable knowledge (facts/decisions/people/recurring) never expires; completed one-off tasks archive (≠ delete) ~12 mo; day-summaries roll off ~18 mo; only T1 verbatim turns age out at 7–14 d.** Plan negotiation: `propose → (revise) → agree → commit`; only an **agreed** plan writes the calendar and sets reminders.

## Reused modules (confirmed shapes — do not rebuild)
- `classifyCapture` / `heuristicClassify` (`lib/ai/classify.ts`) → router's offline fallback + gate.
- `ingestText(ownerId, text, source, tz?)` (`lib/capture/ingest.ts`) → `task` intent.
- `advise(situation)` + `operationalise(ownerId, input)` (`lib/advisory/*`), routes `/api/advisory(/commit)` → advice intent.
- `replan(tasks, now, opts)` (`lib/planner/replan.ts`), `replanOverdue/applyReplan` (`lib/db/repo/tasks.ts`), `/api/replan` → split into propose/commit.
- `consultReply(ownerId, messages)` (`lib/consult/consult.ts`) → `question` (non-filing) intent.
- `createReminderRule(ownerId, {target,schedule,scheduleConfig,channel,nextFire})` (`lib/db/repo/reminders.ts`), `computeNextFire` (`lib/reminders/schedule.ts`) → auto-set reminders on commit.
- `withOwner` (`lib/db/index.ts`), `MODELS`/`modelFor` (`lib/ai/index.ts`), `aiOffline` (`lib/ai/offline.ts`), `runCron` (`lib/cron/run.ts`).
- `embed` (`lib/ai/embeddings.ts`), `indexEntity`/`searchEntityIdsByVector` (`lib/db/repo/embeddings.ts`); embeddings table = `(owner_id, entity_type, entity_id, embedding vector(1536))`.

---

## Phase 1 — Data layer

New owner-scoped tables in `lib/db/schema.ts` (each: `id`, `owner_id`, `...timestamps`):
- **`conversations`** — `started_at`, `phase` (open|work|adapt|advise|close), one row/day-session.
- **`conversation_turns`** — `conversation_id`, `role` (cos|user), `text`, `intent`, `actions_json` jsonb, `refs_task_id` uuid?, `prune_eligible` bool default false. *Verbatim; the ONLY tier subject to retention + completion-pruning.*
- **`conversation_summaries`** — `date`, `summary_text`, `open_threads_json` jsonb. *T2 — durable, fully retrievable; rolls off ~18 mo (§4.6.1).*
- **`memory_facts`** — `kind` (preference|commitment|fact), `subject`, `value`, `source_turn_id`, `confidence`, `active` bool, `never_expire bool default true`. *T3 durable, coded; `never_expire` guards facts/decisions/recurring from every timer.*
- **`plans`** — `date`, `state` (proposed|revised|agreed), `items_json`, `change_log_json`, `agreed_at`. *FR45 gate.*
- Alter **`users`**: add `retention_days int not null default 7` (verbatim window, 7–14), `completed_archive_months int not null default 12` (archive completed one-off tasks), `summary_retention_months int not null default 18` (roll off day-summaries) — all owner-configurable (§4.6.1).
- Alter **`tasks`**: add `archived_at timestamptz?` — completed one-off tasks archived out of the active/searchable set; the row + audit are retained (**archive ≠ delete**, NFR-5).
- Alter **`embeddings`**: add `source text` (turn|fact|summary), `expires_with_turn_id uuid?` (FR47/§4.7 lifecycle).

**Critical RLS step (two arrays):** add every new table name to **both** `OWNER_SCOPED_TABLES` in `lib/db/schema.ts` **and** the hardcoded `owner_tables` array in `lib/db/rls.sql` (the loop that ENABLEs+FORCEs RLS + creates the `_owner_isolation` policy). Missing either = no isolation (NFR-7). At-rest encryption (NFR-3) is inherited from Neon — no extra field-level work; keep durable layers coded (NFR-1).

Migrations: `npm run db:generate` (creates `./drizzle/000X_*.sql`), then `npm run db:migrate` (extension → drizzle → rls.sql, idempotent). Repos under `lib/db/repo/`: `conversations.ts`, `turns.ts`, `summaries.ts`, `facts.ts`, `plans.ts` — all bodies wrapped in `withOwner`.

**Verify:** RLS isolation test for each new table (clone `phase0/rls.test.ts`); `db:migrate` clean.

## Phase 2 — Orchestrator (FR43)

- `lib/orchestrator/router.ts` — `routeIntent(ownerId, message, context): {intent, confidence, args}`. LLM via `modelFor(undefined, "route")` (Haiku); offline fallback reuses `heuristicClassify` + keyword rules. Intents: `calendar | task | completion | status | question | handoff`.
- `lib/orchestrator/act.ts` — dispatch intent → existing module: `task`→`ingestText`; `calendar`→plan propose (Phase 5); `completion`→`setTaskStatus`; `status`→read ledger; `question`→`advise`/`consultReply`; `handoff`→handoff repo. Returns typed `actions[]` (`{type:'task_created'|'done'|'calendar'|'reminder'|'moved', label, undo}`).
- `app/api/orchestrator/route.ts` (POST `{message, tz}`) — auth → `buildContext` (Phase 3) → `routeIntent` → `act` → `reply` (Haiku) → persist user+cos turns + fact-extract (Phase 3) → `{reply, actions[], plan?}`.
- **Confirmation scales with stakes:** unambiguous low-risk writes execute and report; ambiguous/high-stakes return a confirmation (no write yet); low confidence → advisory (`advise`).
- `modelFor` (`lib/ai/index.ts`): extend kinds with `route|summarize|extract` → all **Haiku**; keep Opus for advisory/vision only.

**Verify:** offline routing unit tests; integration test "finished X" → `done` action + status write.

## Phase 3 — Memory core (FR46)

`lib/memory/`:
- `turns.ts` — `appendTurn(...)`, `lastTurns(ownerId, n=6)` (OPEN items only; excludes turns whose `refs_task_id` is completed).
- `facts.ts` — `extractFacts(ownerId, turn)`: cheap Haiku pass (piggy-backed on the orchestrator turn) → ADD/UPDATE/DELETE/NOOP into `memory_facts` (Mem0 pattern on our store). Offline = no-op. Embeds new facts (`embed` + `indexEntity(source='fact')`).
- `summary.ts` — `updateRollingSummary(ownerId)`: **incremental** (anchor + new turns, ≤~400 tokens); `finalizeDaySummary` writes a durable T2 row + embeds (`source='summary'`). Offline = deterministic/no-op.
- `context.ts` — `buildContext(ownerId, message)`: `summary + lastTurns(6) + ledgerSlice(todaysPlan+openTasks+overdue+waitingOn, EXCLUDING completed) + conditional topK(3–5)` only when `messageReachesBack(message)`. Assemble ≤ `MEMORY_CONTEXT_TOKEN_CAP` (~3k). Retrieval via `searchEntityIdsByVector` over fact/summary/in-window-turn embeddings.

**Verify:** offline tests — extraction no-ops, context bounded & excludes completed, summary regenerable.

## Phase 4 — Conversation-first UI (BINDING; match mockup) — direct replacement

- `components/session-view.tsx` (client, mount-gated for tz like `brief-view`): greeting + `day-divider` + thread of `.msg`/`.bubble` + inline **plan card** + **action cards** (with undo) + **seed chips**. The **single pinned composer** (below) drives it. Calls `POST /api/orchestrator`; appends `{reply, actions, plan}`; optimistic user bubble; `router.refresh()` after writes so structured screens reflect changes.
- **Home swap:** `app/(app)/brief/page.tsx` renders `<SessionView/>` (server fetches today's plan/tasks/initiatives for the opening; daily Open turns come from cron, Phase 6). Retire `brief-view.tsx` hero/focus/glance.
- **Single composer — one chat bar (owner correction, 2026-06-30):** there is exactly ONE composer — the **pinned bottom bar (the retained capture bar)**. It is the single text entry and routes to `POST /api/orchestrator`, and it **keeps Voice (🎙) and Image (📷)** capture (FR29) — voice/image transcribe → text → orchestrator so they land in the thread. The mockup renders TWO bars on home (the in-thread session composer **and** the pinned `#capturebar`); per spec §5.1 ("one composer") the **duplicate text input is removed** so only one chat bar shows. Drop the **Text/Voice/Image mode tabs** and the **"To:" recipient picker** (§5.1.6 — no pickers in the primary flow); hand-off is an inferred intent confirmed via the Inbox. Keep the hint "you talk · I file, schedule & remind" and the **seed chips** above the composer. (Implementation: keep `components/capture-bar.tsx` as the single composer — strip its mode tabs + recipient, point its text send at `/api/orchestrator`, retain its `MediaRecorder`/file voice+image; the `SessionView` renders only the thread + cards, no second input.)
- **Nav/IA** (`components/nav.tsx`): home item = **Today** (session). Add **Settings** group → **Memory** (Phase 7). Keep Consult screen (mockup retains it) — also reachable as a session behavior. Keep `top-bar` (already device-tz correct).
- **CSS:** port the mockup's missing classes into `app/globals.css` using **existing semantic tokens** (`--office/--dev/--life`, `--surface`, `--line`, `--grad-hero`/`--grad-cta`) so **both themes** work: `.plancard(.revised/.agreed)`, `.pitem(.moved)`, `.planacts/.pbtn`, `.actcard(.add/.done/.cal/.rem)/.undo`, `.sseed`, `.daydiv`, plus Phase-7 `.memcard/.factrow/.slidewrap/.dayhist`. Reuse existing `.composer/.thread/.msg/.bubble`.

**Verify:** `npm run dev`, drive a session (add / finish / "2 PM call came up" → plan card / "should I…" → advice); both themes; mobile; `:focus-visible`/reduced-motion; no wrong-date flash.

## Phase 5 — Plan negotiation (FR45)

- Split `/api/replan`: `app/api/plan/propose/route.ts` → `replan(...)` then writes a `plans` row `{state:'proposed'|'revised', items_json, change_log_json}`; returns plan + change log. `app/api/plan/commit/route.ts` (POST `{planId}`) → `applyReplan` (writes `due_date`) + `createReminderRule` per affected item + `plans.state='agreed'`, `agreed_at`. **Nothing writes the calendar until commit.**
- Orchestrator `calendar`/unplanned intents call propose and return `plan` → `session-view` renders the **revised plan card** (moved rows highlighted) with **Agree & set reminders / Tweak**; Agree → `/api/plan/commit`; Tweak → free-text loop.

**Verify:** propose returns change log w/o writing; commit writes due_dates + reminder_rules + flips state; offline deterministic.

## Phase 6 — Session lifecycle (FR44)

- `lib/session/*` — open/phase/close helpers; `cron/brief` (04:25) opens the day: create `conversations` row + post greeting + today's plan as the first `conversation_turns` (reuse `composeBrief("am")`). `cron/sweep` (21:45) posts the evening close + `finalizeDaySummary` (Phase 3). Both via `runCron`. Mixed-initiative: surface stalled initiatives / waiting-on / risks.

**Verify:** cron routes (CRON_SECRET) create open/close turns + a finalized durable day-summary per tenant.

## Phase 7 — Retention (FR47) + Memory/Settings view (FR48)

- `app/api/cron/retention/route.ts` (new daily cron in `vercel.json`) via `runCron`, per owner, runs **three sweeps**, each skipping the never-expire class entirely (§4.6.1):
  1. **Verbatim:** delete `conversation_turns` older than `retention_days` **plus** `prune_eligible` turns, and their `source='turn'` embeddings.
  2. **Completed-task archive (≠ delete):** set `archived_at` on completed **one-off** tasks (recurrence null) whose `completed_at` is older than `completed_archive_months`, and delete their embeddings; row + audit retained (NFR-5).
  3. **Summary roll-off:** delete `conversation_summaries` older than `summary_retention_months` and their `source='summary'` embeddings.
  **Never touch** `memory_facts.never_expire` rows, `decisions`, `people`, or recurring tasks.
- Completion hook: when `setTaskStatus`→completed (and initiative complete), mark turns referencing only that item `prune_eligible=true`.
- `app/(app)/memory/page.tsx` (server: current summary + active facts + day list) → `components/memory-view.tsx` (client): **verbatim slider 7–14 (default 7)** with shorten-confirm warning; **tiered windows** (`completed_archive_months` ~12, `summary_retention_months` ~18) framed as efficiency hygiene; **"what I remember"** (rolling summary + `factrow` list, edit/delete → `/api/memory/facts/[id]` — the **only** way to remove durable knowledge); **history by day** (`dayhist`, full vs summary-only). `PATCH /api/settings/retention` writes the three `users` windows.

**Verify:** lowering verbatim warns; raising non-destructive; verbatim purge hits only out-of-window/pruned turns; archive sets `archived_at` + drops embeddings but keeps row/audit and **skips recurring tasks**; summary roll-off deletes only past-window summaries; **never-expire facts/decisions/people untouched by every sweep**; fact edit/delete persists; isolation holds.

## Phase 8 — Cost guardrails (NFR-10)

- `MEMORY_CONTEXT_TOKEN_CAP` env (~3000) enforced in `buildContext`. Haiku-first routing (Phase 2). Conditional retrieval (Phase 3). Incremental summary. Fact-first over summary growth. `AI_OFFLINE=1` → deterministic memory (hard cost floor + hermetic tests). Per-owner tokens/turn logged (audit/counter) with a budget-exceed log/alert.

**Verify:** offline path produces bounded deterministic context; token logging present.

---

## Cross-cutting
- **Offline/hermetic:** every new AI call branches on `aiOffline()` with a deterministic fallback; suite stays green under `AI_OFFLINE=1`.
- **Confidentiality (NFR-1/2/3, §4.8):** summaries/facts/embeddings inherit **coded** office refs; office conversation memory stays on local Postgres+pgvector — **never** a third-party cloud memory service; at-rest encryption inherited from Neon.
- **Isolation (NFR-7):** all memory tables `owner_id` + FORCE RLS via `withOwner`; hand-off copies content, never history.
- **Tiered retention (NFR-5):** durable knowledge (facts/decisions/people/recurring) never expires (timer-immutable); completed one-off tasks **archive, not delete** (~12 mo) with audit retained; day-summaries roll off (~18 mo); only T1 verbatim turns time-boxed (7–14 d). All windows owner-configurable, defaulted generous.
- **Tests:** new `tests/phase7/` — router intents (offline), memory extract/summary/context (offline + bounded + excludes completed), plan propose/commit, **retention: verbatim purge + completion-pruning + completed-task archive (skips recurring; keeps row/audit) + summary roll-off + never-expire class untouched**, RLS isolation for the new tables. Keep all 119 existing green (regression gate).

## Verification (end-to-end)
1. `npm run db:up && npm run db:migrate` (new tables + RLS). 2. `npm run test:run` (existing 119 + new, `AI_OFFLINE=1`). 3. `npm run build` green. 4. `npm run dev` → drive a full session locally (open → add/finish/replan-negotiate/advice → memory view → retention shorten warning), both themes + mobile. 5. Deploy: push → Vercel; run `db:migrate` against **Neon** (additive tables/columns are safe); set `MEMORY_CONTEXT_TOKEN_CAP`; add `cron/retention` to `vercel.json`; smoke-test the live session.

## Risks & mitigations
- **Live home replacement (direct):** build on a branch; full local verification + both-theme + mobile pass before deploy; deploy off-peak; keep `/brief` route resolvable during cutover as a fallback.
- **Prod migration:** all additive (new tables + nullable columns) — low risk; run with the two-role Neon setup (`MIGRATE_DATABASE_URL`).
- **RLS dual-array** omission → silent leak: covered by per-table isolation tests (CI gate).
- **Memory cost drift:** NFR-10 caps + per-owner token logging; offline floor.
- **Undo semantics:** each action card's `undo` calls the inverse of a known mutation (delete created task / revert status / un-commit plan) carried in `actions_json`.
- **Tiered retention safety:** the never-expire class (facts/decisions/people/recurring) is timer-immutable — only explicit user deletion removes it; completed-task archival is non-destructive (`archived_at` + embedding drop; row/audit kept). Guarded by retention-sweep tests so a misconfigured window can never erase durable knowledge or the ledger.

## Phase summary

| Phase | Deliverable | Maps to |
|------|-------------|---------|
| 1 | 5 memory tables + retention cols (`users` ×3, `memory_facts.never_expire`, `tasks.archived_at`) + embeddings cols; RLS (dual-array); repos | FR46/47, NFR-5/7 |
| 2 | `/api/orchestrator` + intent router (Haiku) → existing modules | FR43 |
| 3 | Memory core: turns, write-before-compaction facts, rolling summary, bounded context | FR46, NFR-10 |
| 4 | Conversation-first UI (session home, merged composer, action cards) — match mockup | FR43/44, NFR-11 |
| 5 | Plan negotiation: propose/commit split + revised plan card + auto-reminders | FR45 |
| 6 | Daily session open/close cron + finalized day-summaries | FR44 |
| 7 | Tiered retention cron (verbatim purge + completion pruning + completed-task archive + summary roll-off; never-expire skipped) + Memory/Settings view | FR47/48, NFR-5 |
| 8 | Cost guardrails: token cap, conditional retrieval, per-owner logging, offline floor | NFR-10 |
