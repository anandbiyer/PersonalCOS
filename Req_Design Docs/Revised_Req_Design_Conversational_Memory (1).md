# Personal COS — Conversational Upgrade & Conversation Memory
## Revised Requirements & Design (for Claude Code)

**Status of this document:** this is the *next increment* on top of the deployed build (Phases 0–6, 119 tests green, live on Vercel + Neon + Clerk). It specifies (a) the **conversation-first** operating model and UI, and (b) a dedicated **Conversation Memory** subsystem designed to stay robust *and* cheap as usage grows. It is written as a delta against `Implemented_Req_Design.md`.

**Companion artifact (binding):** `PersonalChiefOfStaff_Mockup_FINAL.html` is the **source of visual truth** for §5. The UI specification in §5 must be **strictly adhered to** — see NFR-11.

**Sources reconciled (see §9):** this document has been cross-checked against **Requirements Spec v2.5**, **Design Document v1.3**, and **`Implemented_Req_Design.md`**. §9 carries the FR-numbering crosswalk, a conversational-content coverage table, the NFR reconciliation, and the gaps found-and-fixed. Where the sources conflict (notably FR numbering), **this document's numbering is authoritative**.

**FR numbering:** the build already occupies **FR1–FR42** (incl. FR39 themes, FR40 date-extraction, FR41 9 pm default, FR42 device-tz). New work is numbered **FR43+** to avoid collision. Earlier "conversational" FR39–41 from draft spec v2.5 are superseded by FR43–FR45 here.

**Legend:** ✅ already built · 🔧 refactor existing module · 🆕 new build

---

## 0. The behavioral shift (the whole point)

> **The manager only converses. The COS interprets every message, converts it into the right task / calendar item / status update, re-plans, auto-sets reminders, and then monitors.**

Today the app is *forms-and-screens*: a capture bar that files, a separate Consult screen that chats, a dashboard that lists. The target is *conversation-first*: one ongoing dialogue is the primary interface, and the agent silently routes each message to an action **and** replies like a chief of staff. No mode pickers, no portfolio pickers — the agent infers intent.

This reuses the existing engine; it does not replace it. `classify.ts`, `capture/ingest.ts`, `advisory/*`, `planner/replan.ts`, `consult/*`, and the reminder engine all become **tools the orchestrator calls**.

---

## 1. New functional requirements (FR43–FR48)

| FR | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| **FR43** | **Conversational orchestration with intent routing.** One endpoint holds the dialogue; every message is routed to an action *and* a conversational reply. | Must | Unifies FR1 (capture), FR15 (advisory), FR33 (consult) as behaviors of one conversation. |
| **FR44** | **Daily working session.** The COS opens the day proactively (greeting + today's plan) and sustains a mixed-initiative session (either party may drive) through to the evening sweep. | Must | Open → Work → Adapt → Advise → Close. Reuses FR25 brief as the "Open". |
| **FR45** | **Collaborative plan negotiation.** Re-planning is *proposed → discussed → agreed → committed*; agreement auto-sets reminders for affected items. | Must | **Refines FR8** from automatic to negotiated. Only an *agreed* plan writes to the calendar. |
| **FR46** | **Conversation memory (tiered).** Persist dialogue as: raw turns + rolling summaries + extracted durable facts + the structured ledger, and assemble a **bounded** per-turn context from them. | Must | See §4. Designed for flat per-turn cost as history grows. |
| **FR47** | **Configurable retention — verbatim window + tiered lifecycle.** Verbatim turns: per-user `retention_days` (7–14, **default 7**) + completion-triggered early pruning. Beyond verbatim, a **tiered lifecycle** (§4.6.1): durable knowledge (facts/decisions/recurring) **never expires**; completed one-off tasks **archive ~12 mo**; day-summaries **roll off ~18 mo**. All windows owner-configurable, defaulted generous; the never-expire class is timer-immutable. Warn before shortening. | Must | Tiered retention is optional cost-hygiene, not required behaviour; protects NFR-5. |
| **FR48** | **Inspectable / editable / deletable memory.** The owner can scroll history (with day dividers), view what the COS "remembers" (durable facts + current summary), correct a remembered fact, and delete a day or a fact. | Should | Memory the agent acts on must be transparent and correctable. |

### Refinements to existing FRs
- **FR8 (replan)** 🔧 → **negotiated** (propose → agree → commit); never silent. Existing `/api/replan` becomes a *propose* step + a separate *commit* step.
- **FR1 / FR15 / FR33** 🔧 → reframed as **outcomes of FR43's router**, not separate entry points. The Consult gate in `classify.ts` graduates from binary (actionable vs chat) into the **multi-class intent router**.
- **FR25 (brief)** 🔧 → the AM brief becomes the **session Open** (first messages of the thread), not a static artifact.
- **FR6/FR38 (reminders)** ✅→🔧 → plan **agreement** is now a reminder trigger (auto-set on commit).

---

## 2. Changes to the current build (refactor map)

### 2.1 Backend / API
| Change | Type | Detail |
|--------|------|--------|
| `app/api/orchestrator/route.ts` | 🆕 | The single chat entry point. Loads bounded context (§4.4) → intent router (Haiku) → calls the right existing module → returns `{ reply, actions[], plan? }`. |
| `lib/orchestrator/router.ts` | 🆕 | Intent classifier → one of: `calendar` · `task` · `completion` · `status` · `question` · `handoff`. Reuses `classify.ts` heuristics as the offline fallback. |
| `lib/session/*` | 🆕 | Daily session lifecycle: open (from `cron/brief`), phase tracking, evening close. |
| `lib/planner/replan.ts` + `/api/replan` | 🔧 | Split into **propose** (returns a `plans` row, state `proposed`/`revised`, with `change_log`) and **commit** (state `agreed`, writes calendar, fires reminders). |
| `lib/memory/*` | 🆕 | Conversation memory subsystem (see §4). Turn store, fact extraction, rolling summary, context assembler, retention cron. |
| `lib/ai/index.ts` `modelFor` | 🔧 | Add `kind: "route" | "summarize" | "extract"` → **Haiku** (cheap). Keep Opus for advisory/vision only. |
| `cron/retention` | 🆕 | Daily purge of raw turns older than each user’s `retention_days` (7–14) **plus** completion-pruned turns; expires their embeddings; never touches summaries/ledger. |
| `AI_OFFLINE` path | 🔧 | Memory ops degrade deterministically (no-op extract/summarize; structured-only retrieval), preserving hermetic tests. |

### 2.2 Frontend (the UI inversion)
| Change | Type | Detail |
|--------|------|--------|
| Home screen | 🔧 | Becomes the **session thread**: opens with greeting + an interactive **plan card**; one composer at the bottom. Replaces the dashboard-as-home. |
| Capture bar + Consult screen | 🔧 | **Merged** into the single session composer. The manager types in one place; the agent routes. |
| Inline **action cards** | 🆕 | In-thread confirmations: `✓ Task created` · `✓ Done` · `📅 Added` · `↔ Moved`, each with **undo**. |
| **Revised plan card** | 🆕 | On an unplanned item, a card shows what moved (highlighted) with **Agree & set reminders / Tweak**. Agreeing commits + sets reminders. |
| **Scrollback + day dividers** | 🆕 | History is real and navigable; each day is a section. (FR48) |
| **Memory / Settings view** | 🆕 | Retention slider (3–12 mo, default 6), "what I remember" (durable facts + current summary), edit/delete. (FR47/48) |
| Structured screens (Calendar, Tasks, Initiatives, Inbox, Investments, Reports, People) | ✅ | **Kept as the record to review** — now reflect the agreed plan. |
| Two themes (aurora / sunrise) | ✅ | Unchanged; keep per-user `data-theme`. |

---

## 3. Conversational architecture & design

### 3.1 Orchestrator (FR43)
Every message → `/api/orchestrator`:
1. **Assemble bounded context** (§4.4) for the owner (RLS-scoped).
2. **Route intent** (Haiku, with ledger/calendar/plan/memory in context): `calendar | task | completion | status | question | handoff`.
3. **Act** by calling the existing module (capture/planner/advisory/handoff). Action and conversation are **layered** — a single turn can both write and speak.
4. **Reply** in natural language, usually with a follow-up ("Done — that clears Thursday; want me to pull deck prep forward?").
5. **Persist** the turn + run write-before-compaction extraction (§4.3).

**Confirmation scales with stakes:** unambiguous low-risk writes (mark done, clearly-dated event) execute and are reported; ambiguous/higher-stakes ones confirm first; low confidence → ask, don't guess (auto-invoked advisory).

### 3.2 Daily session (FR44)
`cron/brief` (04:25) opens the session: posts greeting + today's plan as the first thread messages. The session runs **Open → Work → Adapt → Advise → Close**; `cron/sweep` (21:45) posts the evening close. Mixed-initiative: the COS may proactively surface stalled initiatives, waiting-on items, or risks.

### 3.3 Plan negotiation (FR45) — the agreement gate
```
unplanned item
  → planner.propose()  // recompute vs calendar + capacity + template
  → plans row {state: proposed|revised, items[], change_log}
  → present revised plan card (what moved + why)
  → manager reacts (Agree / Tweak / free text)
  → planner.revise() … loop …
  → AGREE → commit(): write calendar + auto-set reminders + state=agreed
```
Only an **agreed** plan writes to the calendar. Nothing is silently rearranged. New `plans` table; `/api/replan` refactored into propose/commit.

---

## 4. MEMORY — Requirements & Design (dedicated section)

> Goal: the conversation *is* the interface, so memory must (1) let the agent reason over relevant history, (2) **survive across days**, (3) stay **isolated** per tenant, (4) keep **office content coded**, and (5) keep **per-turn cost flat** as history grows. The design follows the 2025–2026 production consensus: a three-tier architecture with **extraction before compaction** and **bounded, retrieval-assembled context** per turn (see References).

### 4.1 Cost principle (read first)
Per-turn cost is driven almost entirely by **input tokens assembled per message**. Replaying full history is linear and unaffordable; selective memory keeps it flat. Two levers do the heavy lifting:
- **The structured ledger is the real memory.** Most of what matters from a conversation should not live *as chat* — it's extracted into rows (tasks, plan, decisions, waiting-on, people). The agent reads commitments from the ledger, not from re-reading the transcript. This is the single biggest cost saver.
- **Bounded context per turn.** Never load unbounded history. Target ≈ **2–3k input tokens/turn**: rolling summary (≤ ~400 tokens) + last **~6 raw turns** + a **relevant ledger slice** (today's plan, open/overdue tasks, waiting-on) + **top-k (3–5)** retrieved snippets only when the message reaches back. **Completed/closed items never re-enter context** — their outcome is a ledger row.

### 4.2 Three-tier architecture (FR46)
| Tier | What | Lifetime | Sent to model? |
|------|------|----------|----------------|
| **T1 — Working memory** | Current session: rolling summary + last ~6 raw turns | The day | Yes, every turn (bounded) |
| **T2 — Session/durable summaries** | Per-day rolling summary, finalized at close; **kept permanently** | Indefinite | The relevant summary only |
| **T3 — Structured + semantic store** | The ledger (tasks/plan/decisions/people/waiting-on) **+** extracted durable facts **+** embeddings | Indefinite (ledger/facts/summaries); raw-turn embeddings follow retention | Retrieved by relevance (top-k) |

### 4.3 Write-before-compaction (the key implementation detail)
**Extract after every turn, not at compaction time.** On each orchestrator turn, a cheap Haiku pass (piggy-backed on routing) emits zero or more **durable facts / commitments / preferences** and ADD/UPDATE/DELETE/NOOP them into T3 (Mem0-style maintenance, but on our own store). By the time the rolling summary updates or raw turns age out, everything actionable is already structured — so compaction and retention are **lossy only for exact wording, never for substance**.

Examples: "I prefer deep work before 6 am" → durable preference; "waiting on Owner A for the pilot scope" → waiting-on row; "we decided to go Send over Ascend" → decision row.

### 4.4 Per-turn context assembler (`lib/memory/context.ts`)
```
buildContext(ownerId, message):
  summary   = currentRollingSummary(ownerId)              // ≤ ~400 tokens
  recent    = lastTurns(ownerId, N=6)                     // sliding window, OPEN items only
  ledger    = todaysPlan + openTasks + overdue + waitingOn// structured, cheap; excludes completed
  retrieved = (messageReachesBack(message))               // only if needed
              ? topK(embedSearch(message, ownerId), k=3..5)
              : []
  return assemble(summary, recent, ledger, retrieved)     // ≤ ~2–3k tokens
```
Retrieval is **conditional** (skip it for "mark X done"). **Completed work is excluded** — once a task is done, its turns are never re-assembled into context; the ledger outcome is all the agent needs.

### 4.5 Rolling summary (anchored, incremental)
Update the summary **incrementally** (anchor + new turns → updated summary) rather than re-summarizing the whole day each time — cheaper and stable. Finalize at session close into a permanent **T2** day-summary. Keep summaries small and structured (open threads, decisions, waiting-on, plan state). **Always regenerable** from raw turns while they exist, so a bad summary is never permanently lossy.

### 4.6 Retention lifecycle (FR47)
- **Setting:** per-user `retention_days` ∈ [7, 14], **default 7**.
- **Ages out:** only **raw turns** (and their embeddings) older than the window.
- **Completion-triggered early pruning (the cost win):** when a task/initiative is marked complete, turns that concern *only* that item become eligible for summarize-and-drop **ahead of** the time window. The outcome is already a ledger row, so the verbatim is discarded early. Done work is never re-read.
- **Beyond verbatim (tiered — see §4.6.1):** day-summaries (T2) and the ledger/facts (T3) are **not** subject to the verbatim window. They follow a separate, generous **tiered retention lifecycle** with an explicit **never-expire** class for durable knowledge.
- **Cron:** `cron/retention` (daily) deletes turns older than each user's window **plus** turns flagged by completion-pruning, and the embeddings derived from them; semantic recall past the cutoff runs over **summaries**, not raw turns.
- **Changing it:** raising is safe (applies forward, can't resurrect purged turns); **lowering is destructive** → UI must warn + confirm before the next sweep purges newly out-of-window turns.
- **Honest trade-off (documented):** with a 1–2 week verbatim window, the *exact wording* of an older conversation will not exist — only its summary and ledger outcome. This is the intended trade ("completed = done, don't refer again"); any decision needing verbatim permanence is captured into the ledger at the time it's made.
- **Reconciliation with NFR-5 (Retention — "full historical retrieval required").** NFR-5 governs the **ledger** (tasks, initiatives, decisions, events, people, day-summaries), which persists with full retrieval — see the tiered lifecycle below. The 1–2 week window applies **only to verbatim conversation transcript**, which NFR-5 never required to be permanent. So there is no conflict: durable records remain retrievable; only raw chat wording is time-boxed.

### 4.6.1 Tiered retention lifecycle (beyond verbatim)
**Principle (read first):** the expensive resource is **per-turn tokens**, which the verbatim window and on-demand retrieval already bound. Day-summaries and ledger rows are **tiny and retrieved-on-demand**, so expiring them saves *storage* (a few MB/year for two users) — **not** the thing that scales the bill. Therefore this lifecycle is an **optional cost-hygiene knob, defaulted generous, not a required behaviour**, and it must **never** apply to the durable-knowledge class. Retention is **by type and state**, not a single timer:

| Class | Examples | Default lifecycle | Setting |
|-------|----------|-------------------|---------|
| **Durable knowledge — NEVER expires** | preferences/facts, decisions, people-notes, **recurring** commitments (renewals, anniversaries, annual reviews) | **Kept indefinitely.** Off-limits to every timer. Protects NFR-5 + the "no task loss" success criterion and keeps the agent from getting dumber over time. | (none — hard rule) |
| **Completed one-off tasks** | a finished task/event with no recurrence | **Archive at ~12 months** → move to cold storage (out of the active/searchable set) and drop their embeddings. | `completed_archive_months` (default 12) |
| **Day-summaries (T2)** | the per-day narrative précis | **Roll off at ~18 months.** Episodic recall has a shelf life. | `summary_retention_months` (default 18) |
| **Verbatim turns (T1)** | word-for-word transcript | **7–14 days** (default 7) + completion-pruning (§4.6). | `retention_days` (default 7) |

**Rules & guardrails:**
- **The never-expire class is immutable to timers.** No setting, cron, or "shorten window" action may delete a durable fact, decision, people-note, or recurring commitment. Deletion of these is only ever **explicit, user-initiated** (FR48).
- **Archive ≠ delete.** Completed-task archival moves rows to cold storage (or a compacted form) and removes their embeddings to keep retrieval lean; the audit trail of *what happened* is preserved per NFR-5. (If the owner later wants hard deletion of archived items, that's a separate explicit purge.)
- **All windows are owner-configurable** in the Memory view and **default generous**; they are framed as efficiency hygiene, not required behaviour. A blanket "expire the ledger" is explicitly **out of scope** — it would breach NFR-5 and degrade the agent.
- **Embeddings follow their source row** (§4.7): when a row archives or a summary rolls off, its vector goes with it, so the searchable set stays small and cheap without touching durable knowledge.
- **Cron:** `cron/retention` also runs the tiered sweep (archive completed tasks past `completed_archive_months`; drop summaries past `summary_retention_months`), skipping the never-expire class entirely.

**Net effect:** the bulky, genuinely-stale items (old completed tasks, old narrative summaries) age out for tidiness; the small, high-value durable knowledge the agent reasons over stays permanent. Efficiency gained where it's free; capability never traded away.

### 4.7 Embeddings lifecycle & cost
To control embedding spend and improve signal, **embed at the fact/summary level, not every raw turn**:
- Embed **extracted durable facts** and **day-summaries** (permanent, high-signal, retrieval past the retention window works).
- Optionally embed **raw turns only within the current window** for fine-grained recall; these expire with the turns.
- Use a small/cheap embedding model (current build uses OpenAI embeddings); batch on extraction, not per keystroke.

### 4.8 Confidentiality (extends NFR-1/2)
- Summaries and extracted facts **inherit coded references** ("Client A", never the real name). The permanent layer never holds verbatim client detail.
- Per the **owner-approved 2026-06-18 deviation**, cloud AI *processing* of office content is allowed with coded storage. **But office content must never reach a third-party *connector/cloud memory service*** — so **do not** route office conversation memory through Mem0 *cloud* or any hosted memory SaaS. Self-hosted memory only for office.
- All memory tables carry `owner_id` and sit under the existing `FORCE ROW LEVEL SECURITY` via `withOwner()`. Conversation history is fully tenant-isolated; a hand-off copies content, never history.

### 4.9 Build-your-own vs Mem0 (recommendation)
**Recommended: build-your-own on your existing Postgres + pgvector**, implementing the Mem0 *pattern* (extract → ADD/UPDATE/DELETE/NOOP) yourself.
- Keeps office data off third-party clouds (Mem0 *cloud* would breach NFR-2 for office).
- No per-call external dependency or recurring SaaS cost; you already have people/decisions/embeddings infrastructure.
- Adopt **self-hosted Mem0 OSS** only if you want turnkey extraction *and* are willing to run it in your own infra so office stays local. Mem0 *cloud* is acceptable for **personal/dev portfolios only**, never office.

### 4.10 Cost model & guardrails (NFR-10, new)
- **Per-turn budget:** target ≤ ~2–3k input tokens; hard cap configurable (`MEMORY_CONTEXT_TOKEN_CAP`).
- **Model routing:** Haiku for route/summarize/extract; Opus only for advisory/vision. (Extends existing `modelFor`.)
- **Conditional retrieval:** skip vector search unless the message references the past.
- **Incremental summary:** never re-summarize the whole day per turn.
- **Fact-first:** prefer extracting a structured row over growing the summary.
- **Degradation:** `AI_OFFLINE=1` → deterministic memory (no LLM extract/summarize; structured-only context), keeping tests hermetic and providing a hard cost floor.
- **Observability:** log tokens/turn per owner so cost is visible; alert if rolling average exceeds budget.

### 4.11 Data model additions
| Table | Key columns | Notes |
|-------|-------------|-------|
| `conversations` | id, owner_id, started_at, phase | one row per day-session |
| `conversation_turns` | id, owner_id, conversation_id, role, text, intent, actions_json, refs_task_id, prune_eligible, created_at | **raw verbatim; subject to retention + completion-pruning** |
| `conversation_summaries` | id, owner_id, date, summary_text, open_threads_json, created_at | **T2, permanent** |
| `memory_facts` | id, owner_id, kind (preference/commitment/fact), subject, value, source_turn_id, confidence, updated_at | **T3 durable; coded; ADD/UPDATE/DELETE** |
| `plans` | id, owner_id, date, state (proposed/agreed/revised), items_json, change_log_json, agreed_at | FR45 agreement gate |
| `users.retention_days` | int (7–14, default 7) | FR47 verbatim window |
| `users.completed_archive_months` | int (default 12) | FR47 tiered — archive completed one-off tasks |
| `users.summary_retention_months` | int (default 18) | FR47 tiered — roll off day-summaries |
| `memory_facts.never_expire` | bool (true for facts/decisions/recurring) | hard guard against any timer |
| embeddings | (existing) + `source` (turn/fact/summary), `expires_with_turn_id?` | FR47/4.7 lifecycle |

### 4.12 Memory requirements summary
- **FR46** Tiered conversation memory with bounded per-turn context.
- **FR47** Configurable retention: verbatim 1–2 weeks (default 7 days) + completion-pruning; tiered lifecycle beyond verbatim — durable knowledge never expires, completed tasks archive ~12 mo, summaries roll off ~18 mo (§4.6.1); warn on shorten.
- **FR48** Inspectable / editable / deletable memory (scrollback, "what I remember", correct/delete).
- **NFR-10 (new)** Bounded memory cost: per-turn token cap, Haiku-first routing, conditional retrieval, deterministic offline floor, per-owner token observability.
- **NFR-1/2 (extended)** Summaries/facts/embeddings stay coded; office memory never via third-party cloud memory services.

---

## 5. UI / UX Specification — **BINDING (must be strictly adhered to)**

> **This UI specification is normative, not advisory.** The accompanying mockup — `PersonalChiefOfStaff_Mockup_FINAL.html` — is the **single source of visual truth**. Claude Code must reproduce it faithfully: the layout, the conversation-first interaction model, the component behaviors, the design tokens, and the quality floor below are **requirements**, not suggestions. Deviations (substituting a component library, re-ordering the IA, changing the interaction model, altering tokens) are **not permitted without explicit owner approval**. When in doubt, match the mockup pixel-for-behavior. The two existing themes (aurora / sunrise) are retained exactly.

### 5.1 The non-negotiables (interaction model)
1. **Conversation is the home screen and the primary interface.** The app opens into a session thread, not a dashboard. There is one composer; the manager only converses.
2. **The COS opens the day.** The first messages in the thread are the **greeting + today's plan card** — proactively, on load.
3. **Every action shows up in the thread.** Filing a task, completing one, adding a calendar item, or moving something renders as an **inline action card** with **undo** — the manager never leaves the conversation to see what happened.
4. **Re-plans are negotiated in the thread.** An unplanned item produces a **revised plan card** (what moved, highlighted) with **Agree & set reminders / Tweak**. Nothing commits until Agree.
5. **Structured screens are the record, reached from the left nav** — never the place you input. Calendar, Tasks, Initiatives, Inbox, Investments, Reports, People remain as review surfaces.
6. **No mode/portfolio pickers in the primary flow.** The agent infers intent; the UI must not reintroduce manual classification.

### 5.2 Design tokens (exact — do not alter)
- **Type:** `Manrope` (UI), `JetBrains Mono` (times, metrics, labels).
- **Aurora theme (User A):** bg `#F4F7FE`; office/primary blue `#2D7FF9`; dev violet `#8B5CF6`; life green `#13C296`; amber `#FB9D2B`; pink `#FB5E9D`; ink `#1B2440`; muted `#6B7895`; line `#E8EDF8`. Gradient `linear-gradient(125deg,#5570FF,#8B5CF6,#FB5E9D)`.
- **Sunrise theme (User B):** the existing second palette, applied via `data-theme` from the authenticated user. Per-user theme resolution is retained.
- **Radii:** cards `16–20px`; pills/controls `22–24px`. **Shadows:** soft, low-opacity (`0 12px 34px -24px rgba(27,36,64,.3)`). Generous whitespace; **calm, one-primary-thing-per-screen**.

### 5.3 App shell & information architecture (retain)
- **Left nav grouped by the three systems + Household:** Today (session) · System of Record (Tasks, Investments) · System of Action (Calendar, Waiting on, Reports) · System of Judgment (Consult-as-behavior, Initiatives, People) · Household (Inbox) · Settings (Memory).
- **Top bar:** current date/time, context pill (dawn/evening), and the **user indicator**. *Note: any account "switcher" is a mockup-only demo device; production logs each user into their own account.*
- **Back-to-home affordance** on every non-home screen (the logo is also home).

### 5.4 The session screen (home) — component spec
- **Greeting line** ("Good morning, {name}") + date.
- **Thread** of message bubbles: COS (left, branded avatar "CS") and manager (right). 
- **Plan card** (in-thread): titled "Today's plan" with a `TODAY` tag; rows = `time · item` color-dotted by portfolio. States: **today** (neutral), **revised** (amber, shows moved rows highlighted + `Agree & set reminders` / `Tweak`), **agreed** (green, `AGREED` tag).
- **Action cards** (in-thread): `✓ Task created` (blue) · `✓ Done` (green) · `📅 Added` (violet) · `↔ Moved` (amber); each with a small **undo**.
- **Composer** pinned at the bottom of the thread: single input, hint "you talk · I file, schedule & remind", send button. **Seed chips** above it for discoverability (e.g., "A 2 PM call came up", "Finished the inventory", "Ask for advice").
- **Scrollback** with **day-divider** separators (FR48); reaching older days loads from history (summaries beyond the verbatim window).

### 5.5 Memory / Settings view (FR47/FR48)
- **Retention control:** a slider/stepper for **verbatim history = 7–14 days (default 7)**, with a one-line explainer ("Completed work is summarized and dropped early; summaries and your ledger are kept.") and a **destructive-change confirm** when shortening.
- **"What I remember":** the current rolling summary + the list of durable facts (preferences/commitments), each **editable and deletable**.
- **Per-day history:** open any retained day to read it; show "summary only" for days past the verbatim window.

### 5.6 Quality floor (required)
Responsive (desktop + mobile); `:focus-visible` rings on all interactive elements; `prefers-reduced-motion` respected; accessible color contrast; no layout shift on load (mount-gated local time, per FR42). Custom Tailwind v4 components faithful to the mockup (no shadcn substitution, per the build's existing convention).

### 5.7 Adherence
The mockup is delivered alongside this document. **Build the UI to match it.** If a screen or behavior is ambiguous in this spec, the mockup is authoritative; if both are ambiguous, raise it with the owner rather than improvising a different pattern.

---

## 6. New / updated NFRs
| NFR | Requirement | Notes |
|-----|-------------|-------|
| NFR-10 | **Bounded memory cost** | §4.10. |
| NFR-1/2 | **Coded + local office memory** | §4.8 extension. |
| NFR-7 | **Isolation extends to memory** | all memory tables `owner_id` + FORCE RLS via `withOwner()`. |
| NFR-11 | **UI adherence (binding)** | §5 is normative; the mockup is the source of visual truth. No component-library substitution, IA re-ordering, interaction-model change, or token change without owner approval. |

---

## 7. Build order for this increment
1. **Data:** add `conversations`, `conversation_turns`, `conversation_summaries`, `memory_facts`, `plans`, `users.retention_months`; RLS policies + `withOwner` coverage; migrations.
2. **Orchestrator (FR43):** `/api/orchestrator` + `router.ts` (Haiku route → existing modules) returning `{reply, actions, plan?}`; offline fallback.
3. **Memory core (FR46):** turn store + write-before-compaction extraction + incremental rolling summary + `context.ts` assembler (bounded budget).
4. **Conversation-first UI (per §5, BINDING — match the mockup):** session thread home (greeting + plan card), merged composer, inline action cards (with undo). Reproduce `PersonalChiefOfStaff_Mockup_FINAL.html` faithfully.
5. **Plan negotiation (FR45):** split `replan` into propose/commit; revised plan card with Agree/Tweak; auto-set reminders on commit.
6. **Session (FR44):** wire `cron/brief` to open the day; `cron/sweep` to close + finalize day-summary.
7. **Retention (FR47) + Memory view (FR48):** `cron/retention` (7–14 day verbatim + completion-pruning + tiered archive/roll-off); Settings (verbatim days + tiered windows); "what I remember" + edit/delete; scrollback with day dividers.
8. **Cost guardrails (NFR-10):** token cap, per-owner token logging, budget alert.

---

## 8. Confirmed decisions (owner-approved)
1. **Memory engine:** **build-your-own** on Postgres + pgvector (implement the Mem0 *pattern*; office never leaves local infra). ✅ confirmed.
2. **Monthly AI budget:** **minimal** — Haiku-first routing, ≤ ~2–3k input tokens/turn, conditional retrieval, deterministic offline floor. ✅ confirmed.
3. **Retention:** verbatim window **1–2 weeks, default 7 days, max 14**; **completion is a memory boundary** — completed work is summarized-and-dropped early and never re-read; summaries + ledger persist indefinitely. ✅ confirmed.
4. **Office conversation memory:** remembered as **coded** summaries/facts (consistent with the approved NFR-2 deviation); office memory never via third-party cloud memory services. ✅ confirmed.

---

## 9. Source reconciliation & coverage

This document was reconciled against all three authoritative sources: **Requirements Spec v2.5**, **Design Document v1.3**, and **`Implemented_Req_Design.md`** (as-built). This section records the crosswalk and confirms nothing was dropped.

### 9.1 The FR-numbering conflict (and how it's resolved)
The three sources number the conversational requirements **differently**, because the build shipped UAT features into the slots the draft spec had reserved for the conversational model:

| Concept | Spec v2.5 | Implemented build | **This document (authoritative)** |
|---|---|---|---|
| Per-user visual theme | — | **FR39** ✅ built | FR39 (unchanged) |
| NL due-date extraction at capture | — | **FR40** ✅ built | FR40 (unchanged) |
| Default 9 pm deadline (date-only) | — | **FR41** ✅ built | FR41 (unchanged) |
| Device-timezone-aware dates | — | **FR42** ✅ built | FR42 (unchanged) |
| Conversational orchestration | **FR39** (addendum) | not built | **FR43** |
| Daily working session | **FR40** (addendum) | not built | **FR44** |
| Collaborative plan negotiation | **FR41** (addendum) | not built | **FR45** |
| Conversation memory (tiered) | implied (§20.6 "dialogue state") | not built | **FR46** |
| Configurable verbatim retention | — | not built | **FR47** |
| Inspectable/editable memory | — | not built | **FR48** |

**Resolution:** this document adopts the **implemented** numbering as the baseline (FR1–FR42 as built) and assigns the conversational + memory work to **FR43–FR48**. Spec v2.5's addendum FR39–FR41 are **superseded by FR43–FR45** here. Claude Code should treat this document's numbering as authoritative.

### 9.2 Conversational content coverage (v2.5 §20 / v1.3 §14 → this doc)
Every element of the conversational model from the two design docs is carried forward:

| Source element | v2.5 / v1.3 ref | Carried into this doc |
|---|---|---|
| Manager-only-converses principle | v2.5 §20.1 | §0 ✅ |
| Daily working session (5 phases) | v2.5 §20.2 / v1.3 §14.2 | FR44, §3.2 ✅ |
| Negotiated plan (propose→agree→commit) | v2.5 §20.3 / v1.3 §14.3 | FR45, §3.3 ✅ |
| Conversational orchestration / intent router | v2.5 §20.4 / v1.3 §14.1 | FR43, §3.1 ✅ |
| FR8 refined automatic→negotiated | v2.5 §20.4 | §1 refinements ✅ |
| FR1/FR15/FR33 reframed as behaviors | v2.5 §20.4 | §1 refinements ✅ |
| Every-action-returns-a-reply contract | v2.5 §20.5 / v1.3 §14.4 | §3.1 ✅ |
| Plan entity (proposed/agreed/revised) | v2.5 §20.6 / v1.3 §14.5 | `plans` table, §3.3 + §4.11 ✅ |
| Dialogue state persisted | v2.5 §20.6 / v1.3 §14.2 | **Expanded** into the full memory subsystem (§4) ✅ |
| Conversation-first frontend inversion | v2.5 §20.7 / v1.3 §14.6 | §5 (binding UI) ✅ |
| Design tokens from mockup | v1.3 §8.2 | §5.2 ✅ |

> Note: this document deliberately does **not** re-list FR1–FR38 / NFR-1–NFR-9 (already specified in v2.5 and **already built** per the implemented doc). It is a **delta** for the new increment only.

### 9.3 NFR reconciliation
| NFR | Source | Status here |
|---|---|---|
| NFR-1 Coded office references | v2.5 / built | **Extended** to summaries/facts/embeddings (§4.8) |
| NFR-2 LLM/connector data boundary | v2.5 / built (with approved deviation) | **Honored**: office memory never via 3rd-party cloud memory services (§4.8, §4.9) |
| NFR-3 Privacy & encryption | v2.5 | Unchanged; memory tables encrypted at rest like all data |
| NFR-5 Retention (full historical retrieval) | v2.5 | **Reconciled** (§4.6 / §4.6.1): durable knowledge never expires; completed tasks archive (not delete) ~12 mo; summaries roll off ~18 mo; verbatim 1–2 wk. Audit/history preserved. |
| NFR-7 Multi-tenant isolation | v2.5 / built | **Extended** to all memory tables (`owner_id` + FORCE RLS) |
| NFR-10 Bounded memory cost | **new here** | §4.10 |
| NFR-11 UI adherence | **new here** | §5 (binding) |

### 9.4 Gaps found during reconciliation — and fixed
1. **FR-number collision** between v2.5 (FR39–41 conversational) and the build (FR39–42 themes/date/tz) — **fixed** via the §9.1 crosswalk; conversational work renumbered to FR43–45.
2. **NFR-5 vs the short verbatim window** looked contradictory — **fixed** by clarifying ledger-vs-transcript retention (§4.6, §9.3).
3. **Dialogue state was only a one-liner** in v2.5/v1.3 — **expanded** here into a full, cost-bounded memory subsystem (§4) per your retention/cost guidance.
4. **UI was advisory** in prior docs — **promoted** to a binding specification (§5, NFR-11) at your instruction.

---

## 10. References (memory design basis, 2025–2026)
- Three-tier consensus + write-before-compaction: Mem0, *Context Compression vs Memory in AI Agents* (2026).
- Selective fact extraction vs summarization (80–90% token reduction): Mem0, *LLM Chat-History Summarization Guide* (2026); *State of AI Agent Memory* (2026).
- Compression strategies (sliding window / rolling / hierarchical summaries) and cost-of-context: *Memory for Autonomous LLM Agents* (arXiv 2603.07670, 2026); *How to Build AI Agents That Actually Remember* (2026).
- Production memory frameworks (Mem0 / LangMem / Letta / MemoryOS) and trade-offs: *Adaptive Memory Structures for LLM Agents* (arXiv 2602.14038).
