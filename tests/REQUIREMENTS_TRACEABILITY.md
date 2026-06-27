# Requirements Traceability Matrix

Maps every requirement (Requirements Spec v2.4) to the phase that delivers it and the test cases that prove it. Tests are **woven per phase**: each phase implements the tests for the requirements it builds. This file is the source of truth for coverage — update the Status when a phase lands its tests.

**Status legend:** ✅ Implemented & passing · 🟡 Foundation in place (full coverage in a later phase) · ⬜ Planned (built with its phase)

**Test ID format:** `T-<REQ>-NN` (e.g. `T-NFR7-03`). Test files live in `tests/phase<N>/`.

---

## Phase 0 — Scaffold & foundations (current)

| Req | Requirement | Test IDs | File | Status |
|---|---|---|---|---|
| NFR-7 | Multi-tenant isolation via Postgres RLS | T-NFR7-01 (owner_id present), T-NFR7-02 (RLS enabled+forced), T-NFR7-03 (own-rows-only), T-NFR7-04 (fail-closed, no context → 0), T-NFR7-05 (WITH CHECK blocks cross-tenant write) | `phase0/schema.test.ts`, `phase0/rls.test.ts` | ✅ |
| NFR-4 | Durable storage (schema) | T-NFR4-01 (all 11 tables created) | `phase0/schema.test.ts` | 🟡 (backup/restore: ops, Phase 5) |
| FR13 | Search & retrieval (vector) | T-FR13-01 (pgvector column exists) | `phase0/schema.test.ts` | 🟡 (query coverage: P1) |
| FR39 | Per-user visual theme | T-FR39-01 (theme enum), T-FR39-02 (both token sets), T-FR39-03 (palette colours), T-FR39-04 (per-user resolution) | `phase0/schema.test.ts`, `phase0/theme.test.ts` | ✅ |
| FR35 | Multi-tenancy | T-NFR7-03 (isolation) | `phase0/rls.test.ts` | 🟡 (full multi-user: P5) |
| FR37 | Cross-user hand-off (visibility model) | T-FR37-01 (invitation crosses only sender↔recipient) | `phase0/rls.test.ts` | 🟡 (copy-on-accept flow: P5) |
| FR38 | Scheduled reminders (cron surface) | T-FR38-01 (5 cron jobs declared) | `phase0/scaffold.test.ts` | 🟡 (dispatch: P4/P5) |
| — | App shell / IA scaffold | T-SHELL-01 (all view routes), T-SHELL-02 (root → /brief) | `phase0/scaffold.test.ts` | ✅ |

---

## Phase 1 — System of Record + capture (complete)

| Req | Requirement | Test IDs | Status |
|---|---|---|---|
| FR1 | NL task capture | T-FR1-01, T-FR1-03 (title+provenance), T-FR1-02 (never-silently-fails) | ✅ |
| FR2 | Auto classification | T-FR2-01/03/04, T-FR33-01; LLM path live-validated | ✅ heuristic + LLM |
| FR33 | Conversation-vs-actionable gate | T-FR33-01 | ✅ |
| FR11 | Persistent ledger + CRUD | T-FR11-02 (complete + audit) | ✅ |
| FR3 | Goal & Initiative management | T-FR3-01 (CRUD, RLS-scoped) | ✅ basic; stage gates → P3 |
| FR12 | Decision repository | T-FR12-01 (linked to initiative) | ✅ |
| FR13 | Search & retrieval | T-FR13-02 (structured fallback); vector live-validated (paraphrase) | ✅ structured + vector |
| FR14 | Audit trail | T-FR14-01 | ✅ |
| FR29 | Multi-modal capture + provenance | T-FR29-03; voice+image routes built, wiring live-validated | ✅ (real media = manual check) |
| NFR-1 | Coded office refs | live-validated (Acme → "Client A") | ✅ LLM-enforced |
| NFR-6 | Capture latency / friction | T-NFR6-01 | ✅ |
| Scenario E | Lost chat → persistent repository | ledger persistence | ✅ |
| Scenario I | Capture photo / spoken note | voice+image capture paths | ✅ wired (manual media test) |

**Note:** real STT/Vision/embeddings run only when keys are set and `AI_OFFLINE` is unset; the unit suite forces `AI_OFFLINE=1` to stay hermetic, so those paths are proven by the live smoke test instead.

---

## Phase 2 — System of Action (delivered)

| Req | Requirement | Test IDs | Status |
|---|---|---|---|
| FR4 | Calendar-aware planning (template + exceptions) | T-FR4-01 (exception overrides block) | ✅ |
| FR6 | Reminder engine — quiet-hours aware | T-FR6-01/02/03 (windows, gap, suppress/critical) | ✅ detection; ⬜ dispatch (P4) |
| FR7 | Missed-task detection | T-FR7-01 (overdue), T-FR7-02 (due today/within) | ✅ |
| FR10 | Weekly & monthly reporting | T-FR10-01..04 (completion, at-risk, variance, health) | ✅ |
| FR23 | Waiting-on tracking + nudge age | T-FR23-01 (youOwe/owedToYou + nudgeDays) | ✅ tracking; ⬜ auto-send (P4) |
| FR25 | Daily briefing artifact | T-FR25-01 (AM glance/focus), T-FR25-02 (PM sweep) | ✅ deterministic + LLM narration (live-validated) |
| FR28 | Calendar day/week views | T-FR28-01..04 (template, weekend, dated task, week) | ✅ |
| FR5 | Capacity-based scheduling | T-FR5-01 | ⬜ (depends on initiative engine, P3) |
| Scenario A | Renewal tracked, never auto-paid | T-SCEN-A | ✅ |
| Scenario B | Trip on the calendar | T-SCEN-B | ✅ |
| Scenario C | Schedule variance (early finish) | T-FR10-03 | ✅ |
| Scenario H | Vacation multi-step on calendar | T-SCEN-H | ✅ |

---

## Phase 3 — System of Judgment (delivered)

| Req | Requirement | Test IDs | Status |
|---|---|---|---|
| FR15 | Advisory mode (options + reasoned pick → operationalise) | T-FR15-01 (2–3 options), T-FR15-02 (commit → linked initiative); LLM live-validated | ✅ |
| FR16 | Initiatives with stage gates + never-empty next action | T-FR16-01/02/03, T-SCEN-G (gate blocks then allows) | ✅ |
| FR9 | Study-plan generation (backward-planned) | T-FR9-01..04; live-validated (20 sessions) | ✅ |
| FR20 | Autonomous requirement research | live-validated (real curriculum); offline → null | ✅ (LLM; web-validate → P6) |
| FR33 | Consult mode — no forced filing | T-FR33-02 / T-SCEN-J (replies, files nothing); LLM live-validated | ✅ |
| (invariant) | Anti-ideation: active initiative → action+review or stalled, surfaced in brief | T-INV-01/02/03; wired into `/brief` (composeBrief stalled) | ✅ |
| FR5 | Capacity-based scheduling | folded into study-plan scheduler (FR9) | ✅ (study windows) |
| Scenario D | Certification backward-planned roadmap | T-FR9-*; study-plan + research | ✅ |
| Scenario G | Initiative idea→outcome | T-SCEN-G | ✅ |
| Scenario J | Just chat / seek opinion, no plan | T-SCEN-J | ✅ |

---

## Phase 4 — Cron, notifications & intelligence (delivered)

| Req | Requirement | Test IDs | Status |
|---|---|---|---|
| FR6/FR25/FR38 | Cron dispatch + quiet-hours governance + per-user channels | T-CRON-01/02/03 (auth), T-FR6-04/05 (suppress/critical), T-FR25-03 (ritual), T-FR38-01 (receipt); live-validated (5 crons, 2 tenants) | ✅ dispatch + Telegram/Pushover; web-push subscription UI → P5 |
| FR17 | Momentum / stall detection | T-FR17-01 (recomputeStalled re-flags); live (initiative-review) | ✅ |
| FR18 | Notes-to-action extraction | T-FR18-01 (heuristic); LLM live-validated | ✅ |
| FR19 | People / enablement register | T-FR19-01 (CRUD, RLS); /people UI | ✅ |
| FR22 | Overload & conflict detection | T-FR22-01 (over-capacity day + drop); in /reports | ✅ |
| FR24 | Slippage / deadline-risk prediction | T-FR24-01 (variance fed forward); in /reports | ✅ |
| FR26 | Approval-first execution + graduated trust | T-FR26-01/02 (gate + propose/approve receipts) | ✅ |
| FR27 | Preference & estimation learning | T-FR27-01 (calibration utility) | ✅ utility (wiring to tracked durations later) |
| FR21 | Knowledge re-validation cadence | cron/revalidate flags researched goals + receipt | 🟡 (web re-check → P6) |
| FR8 | Automatic replanning (priority/dependency/deadline/capacity-aware) | T-FR8-01..07 (overdue→future, priority order, dependency order, capacity spread, overflow + deadline conflicts, apply→Replanned+audit, RLS); live-validated (API dry-run + apply) | ✅ |
| Scenario C | Task early → schedule variance | T-FR10-03 / slippage | ✅ |
| Scenario F | Presentation delivered → historical metrics | reports + completion | ✅ |

---

## Phase 5 — Multi-user household (delivered)

| Req | Requirement | Test IDs | Status |
|---|---|---|---|
| FR35 | Multi-tenancy via Clerk identity | clerk id → owner_id resolver (T-FR36-01); RLS suite (phase0/regression) | ✅ |
| FR36 | Clerk auth — individual users, not Orgs | T-FR36-01/02 (upsert/map, no dup); webhook + ClerkProvider + middleware; live (sign-in 200) | ✅ (real login = manual) |
| FR37 | Hand-off copy-on-accept (full flow) | T-FR37-01 (accept→recipient ledger, sender status only), T-FR37-02 (decline→nothing), T-NFR7-08 (third party blind); live (compose/roster/sent) | ✅ |
| FR38 | Per-user interval reminders dispatched | T-FR38-02/03/04 (next-fire, due enumeration, RLS); live (fire-reminders cron fired=1) | ✅ |
| FR39 | Per-user theme resolution | from authenticated user (getCurrentTheme); dev fallback | ✅ |
| NFR-9 | Identity vs data separation | T-NFR9-01 (Clerk holds id; data in Postgres; delete syncs) | ✅ |
| NFR-4 | Backup & tested restore | — | 🟡 (ops task — managed Postgres backups; restore drill at deploy) |
| Scenario L | Send spouse a task; accept lands in their ledger | T-FR37-01 | ✅ |
| Scenario M | Recurring reminder to the right user only | T-FR38-03 + fire-reminders cron | ✅ |

---

## Phase 6 — MCP connectors & read-only investments (delivered)

| Req | Requirement | Test IDs | Status |
|---|---|---|---|
| FR34 | Investment status (read-only) | T-FR34-01 (allowlist allows 5 reads), T-FR34-02 (blocks all trading tools), T-FR34-03 (status mapping), T-FR34-06..09 (encrypted token, RLS, not-connected, disconnect); live (connect + not-connected state) | ✅ (real portfolio read = manual, needs OAuth token) |
| FR31 | Knowledge retrieval over own notes (Notion) | notionSearch + office guard; live (enabled, searchable — share pages for hits) | ✅ personal/dev; office stays Postgres |
| FR20/FR21 | Web search/re-validation (Tavily) | wired into research + revalidate; office-query guard | ✅ (live web when keyed; LLM-only fallback) |
| FR30 | Persistent memory | Postgres-backed (people/decisions/embeddings/estimation) | ✅ covered; Mem0 deferred |
| NFR-8 | Connector trust & scoping | T-NFR8-01 (office→cloud refused), T-NFR8-02 (disabled-without-key), read-only allowlist | ✅ |
| NFR-2 | LLM/connector data boundary | office content never sent to Tavily/Notion (assertNotOffice) | ✅ |
| FR32 | Approval-gated web action (browser) | — | ⬜ deferred (Could; needs hosted browser) |
| Scenario K | Read-only investments | FR34 + `/investments` | ✅ |

---

## Cross-cutting (every phase)

| Concern | Test | Status |
|---|---|---|
| Pre-deploy data hygiene | `db:verify-empty` must pass before push/deploy (see README) | ✅ tooling ready |
| Production build compiles | `npm run build` green | ✅ |
| RLS never regresses (raw) | `phase0/rls.test.ts` runs in every CI pass | ✅ |
| RLS never regresses (app path) | `regression/capture-isolation.test.ts` (R-NFR7-01) | ✅ |
