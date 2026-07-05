# Personal COS — Past-Due Triage (Done / Reschedule / Drop)
## Revised Requirements & Design (for Claude Code)

**Status of this document:** a corrective + feature increment on top of the deployed build (base + FR43–FR54, live on Vercel + Neon). It replaces the way overdue items are handled: instead of lingering silently on the ledger — and, since the Opus reply upgrade, being surfaced at random ("a 5:30 PM call from two days ago") — past-due items are presented as an **interactive triage card** the manager resolves with **Done / Reschedule / Drop**. Written as a delta against the as-built code.

**Why this exists (root cause):** a dated one-off task that is never completed or cancelled stays **open + overdue** forever. `buildContext` injects open/overdue tasks *by name* into the model context every turn (`lib/memory/context.ts:57-68`), and the newly context-grounded Opus reply (commit `396b18e`) voices them — so a stale item resurfaces mid-conversation as if current. The right fix is not to mute the symptom but to make overdue items **resolvable**: once each is Done, Rescheduled to a real future date, or Dropped, it is no longer overdue and stops leaking.

**FR numbering:** FR1–FR54 are occupied; **FR52** is reserved for the strikethrough-resolved-calendar-items candidate (`Revised_Req_Design_Reminders_Calendar.md §8`). This increment takes **FR55**. Authoritative for this increment.

**Legend:** ✅ already built · 🔧 refactor existing module · 🆕 new build

---

## 0. The behavioral shift

> **Overdue work is triaged, not guessed at.** When items are past due, the COS surfaces them as a compact interactive card — one row per item, each resolved with **Done**, **Reschedule** (to a date the manager picks), or **Drop** — the same in-thread card idiom as the "Today's plan" / "Revised plan" cards. The manager decides; the system stops silently rolling overdue items forward, and stops narrating stale ones.

This reuses existing machinery end-to-end:
- **UI:** the in-thread action-card pattern (`components/session-view.tsx` already renders COS-turn cards with buttons — the plan card's Agree/Tweak).
- **Actions:** Done → `setTaskStatus(completed)`; Reschedule → `updateTask({dueDate})` (the same audited path as the `edit` intent, incl. FR50 date grammar); Drop → `setTaskStatus(cancelled)` (soft, recoverable). All three already exist and are audited.

---

## 1. New functional requirement (FR55)

| FR | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| **FR55** | **Past-due triage.** When actionable one-off tasks are overdue, the COS presents an interactive triage card (capped list, one row per item) whose per-row options are **Done / Reschedule / Drop**. Selecting **Reschedule** reveals an inline date/time input on the same card; submitting applies every resolution in one action (complete / re-date / cancel), all audited. Resolved items leave the overdue set, so they stop re-entering context. | Must | Reuses `setTaskStatus` / `updateTask`. No conversational back-and-forth required — the card collects the reschedule date (sidesteps the single-turn router). |

### Refinements to existing FRs
- **FR8 (replan)** 🔧 → the **silent** auto-roll of dated overdue one-offs is **replaced by user triage**. `cron/brief` currently calls `replanOverdue({ apply: true })`, which silently re-dates overdue tasks; for dated overdue one-offs that becomes **propose-not-apply** — they go to the triage card instead, so the manager's choice is authoritative. (Replan keeps its role for genuinely unscheduled backlog / capacity planning.)
- **FR25 / FR44 (brief / session open)** 🔧 → the day's opening may now include a triage card when items are past due (alongside the brief opening turn), once per day.
- **FR46 (bounded context)** 🔧 → resolved items drop out of the LEDGER/RECENT slices, closing the "stale overdue item narrated as current" leak.
- **FR49 (reminder instances)** 🔧 → an overdue **monthly reminder instance** is triageable like any task: Done completes it, Reschedule moves that instance, Drop cancels **that instance only** (the recurring series survives — decision #8 of the reminders increment).

---

## 2. Changes to the current build (refactor map)

| Change | Type | Detail |
|--------|------|--------|
| `lib/planner/overdue.ts` (or extend `planner/reminders`) | 🆕 | `overdueTriageItems(tasks, now, { cap })` → the actionable overdue set as `{ id, name, dueDate, portfolio, effortMin, reminderRuleId }[]`, excluding completed/cancelled, routine template blocks, and un-actionable rows; capped (default 7) with an overflow count. |
| COS turn emit (session open + on-demand) | 🔧 | Emit an `overdue_review` action (in the COS turn's `actionsJson`, same channel as the `plan` card) carrying the triage items. Emitted (a) at **daily session open** when overdue items exist (once per day, guarded on the fresh session), and (b) **on demand** via the `status` intent when the manager asks to review past-due work. |
| `app/api/cron/brief/route.ts` | 🔧 | Switch dated-overdue-one-off handling from `replanOverdue({apply:true})` to propose-only for those items; attach the `overdue_review` card to the day's opening turn when non-empty. |
| `components/session-view.tsx` | 🆕 | `OverdueReviewCard`: a compact table, one row per item (name · was-due date), each with a **Done / Reschedule / Drop** radio group; choosing Reschedule reveals an inline **date/time input** (device-tz, FR42); a single **Apply** button submits all resolutions. Matches the existing card design tokens (NFR-11) — no new component library. Collapses to a confirmation after submit; re-publishes the plan (existing republish hook). |
| `app/api/tasks/triage/route.ts` | 🆕 | `POST` `{ resolutions: [{ id, action: "done"|"reschedule"|"drop", dueDate? }] }` → `withOwner`, per item: `setTaskStatus(completed)` / `updateTask({dueDate})` / `setTaskStatus(cancelled)`. Validates ownership (RLS), rejects unknown ids, returns the updated rows. |
| action-type union | 🔧 | Add `overdue_review` to the orchestrator action / `actionsJson` card types and `ACT_CLASS`/render switch. |

**No schema migration** — triage items ride in the COS turn's `actionsJson` (like the plan card); resolutions apply via existing task columns/repos.

---

## 3. Design detail

### 3.1 The triage card (FR55) — a form, not a conversation
The card is the crux of why this is robust: **the reschedule date is collected in the card, not in chat.** The orchestrator is single-turn, so a conversational *"reschedule → when? → 3pm"* needs stateful continuation (the FR51 pending-slot). The card avoids that entirely — Reschedule reveals a `datetime-local`-style input (interpreted in the device tz, converted to a UTC instant per FR42), and **Apply** POSTs all rows at once. One request, no pending state, no router ambiguity.

- **Options → operations:** Done → `setTaskStatus(id,"completed")` (also flags the item's turns prune-eligible and deactivates a linked one-off reminder rule — existing behavior); Reschedule → `updateTask(id,{dueDate})` (status → planned/replanned, audited); Drop → `setTaskStatus(id,"cancelled")` (soft, recoverable).
- **Reschedule input:** primary is the inline picker. A secondary free-text field may accept natural language ("next Friday 3pm") parsed server-side by `extractDueDate` (FR50 grammar) — optional, not required for v1.
- **Batch apply + confirmation:** one Apply submits every row; the card collapses to "✓ 2 done, 1 rescheduled to Jul 8, 1 dropped" and triggers the existing inline plan republish so the calendar/plan reflect the changes.

### 3.2 When it appears (trigger)
- **Primary — daily session open.** When `openDaySession` opens a fresh day and overdue items exist, the opening includes the `overdue_review` card next to the brief turn (§3.4 of the session-refresh increment). Guarded on the still-empty session so it fires **once per day**, not on every home load.
- **Secondary — on demand.** A `status`-intent request to review past-due work ("what's overdue", "let's clear the backlog") returns the card instead of a prose count.
- **Not reactive mid-flow.** The card is **not** injected into unrelated turns (e.g. while creating a reminder) — that intrusive behavior is exactly what this replaces.

### 3.3 Scope of the overdue set
- **Actionable one-off tasks only** — excludes routine template blocks (Gym/Study — not ledger rows), completed/cancelled, and archived items.
- **Cap** at ~7 rows per card with an "+N more — review later" note (no giant tables).
- **Reminder-linked instances included** — triaged per FR49: Drop cancels the instance, not the series.

### 3.4 Reconciliation with the existing auto-replan (FR8)
Today `cron/brief` silently applies `replanOverdue`, so overdue dated one-offs may be moved without the manager's input. Under FR55 those items are the triage card's responsibility: the brief **proposes** (does not auto-apply) for dated overdue one-offs and surfaces them for triage, so the user's Done/Reschedule/Drop is authoritative. `replanOverdue` retains its role for scheduling genuinely undated backlog into capacity.

---

## 4. Edge cases & guardrails
- **Empty overdue set:** no card emitted; opening is just the brief.
- **Nothing selected on a row:** treated as "defer" — left unchanged (still overdue), not silently resolved; the card can be re-summoned. (A row with no choice is a no-op, never a hidden mutation.)
- **Reschedule to a past instant:** reject / clamp — a reschedule must be a future date/time (validate in the endpoint; surface an inline error).
- **Idempotency / double-submit:** applying a resolution to an already-resolved item is a no-op (status already terminal); the endpoint tolerates re-submission.
- **RLS:** the triage endpoint runs under `withOwner`; ids not owned by the caller are rejected — no cross-tenant resolution.
- **Audit (FR14):** every Done/Reschedule/Drop writes its audit row via the existing repo functions — full before/after preserved.
- **Recoverability:** Drop is a soft cancel (recoverable), not a hard delete.
- **Context leak:** once resolved, items exit the LEDGER/RECENT slices immediately — the originating symptom is closed.

## 5. Data model
No schema change. Triage items travel in the COS turn `actionsJson` (like the `plan` card). Resolutions apply through existing `tasks` columns (`status`, `dueDate`, `completedAt`) and repo functions (`setTaskStatus`, `updateTask`).

## 6. Build order — ✅ ALL DONE
1. **Overdue set builder** (`lib/planner/overdue.ts` → `overdueTriageItems`) — pure; oldest-due first, excludes completed/cancelled/archived/routine, capped with overflow.
2. **Batch apply + endpoint** — `applyTriage(ownerId, resolutions)` in the tasks repo (Done→`setTaskStatus completed`, Reschedule→`updateTask{dueDate}` future-only, Drop→`setTaskStatus cancelled`; RLS-safe, per-item `ok`); `POST /api/tasks/triage` wraps it (zod-validated).
3. **`OverdueReviewCard`** in `session-view.tsx` — radio Done/Reschedule/Drop per row, inline `datetime-local` on Reschedule, one **Apply** POST → `router.refresh()`; rendered **live** from the ledger at the top of the day's thread (always current; vanishes once resolved), so no persisted-turn staleness and no mid-flow injection.
4. **Emit reconciliation** — `cron/brief` switched `replanOverdue({apply:true})` → `{apply:false}`: overdue items are no longer silently rolled forward, they surface in the triage card. On-demand is subsumed by the always-live card.

**Verification:** 5 new tests in `tests/phase10/pastdue-triage.test.ts` (builder filtering/ordering/cap; batch Done/Reschedule/Drop; past-date + foreign-id rejection without aborting the batch; monthly-instance Drop keeps the series). Full suite 252 green; `tsc` clean; build green.

## 7. Decisions
1. **Options = Done / Reschedule / Drop.** ✅ owner-confirmed.
2. **Reschedule date collected in the card** (inline picker), not conversationally — avoids the single-turn-router fragility. ✅ (recommended; confirm.)
3. **Trigger = daily session open (once/day) + on-demand;** never reactive mid-flow. ✅ (recommended; confirm.)
4. **Triage supersedes the silent auto-replan** for dated overdue one-offs (`cron/brief` → propose-not-apply for those). ✅ (recommended; confirm.)
5. **Scope = actionable one-off tasks, cap ~7,** routine blocks excluded, reminder instances included (instance-only Drop). ✅ (recommended; confirm.)

## 8. Test plan (deterministic / offline where possible)
- `overdueTriageItems`: returns only actionable overdue tasks, excludes completed/cancelled/routine, caps at N with overflow count.
- Triage endpoint: `done` → completed (+ turns prune-eligible, linked one-off rule deactivated); `reschedule` → dueDate updated (status planned/replanned, audit written); `drop` → cancelled; batch of mixed actions applied atomically per `withOwner`; unknown/foreign id rejected; past-dated reschedule rejected.
- Reminder-linked overdue instance: Drop cancels the instance, series (rule) stays active.
- Emit logic: session open with overdue → card present (once/day); without overdue → no card; mid-unrelated-flow → no card.
- Regression: resolved items no longer appear in `buildContext` LEDGER/RECENT.

## 9. Companion note (interim, per owner "hold #1–4")
This feature is the durable fix. Until it ships, the reply still voices un-triaged overdue items. The orthogonal reply-prompt tightening ("reference context only when relevant to the current message; don't volunteer unrelated overdue items") would suppress the annoyance in the interim without changing behavior — available on request; held per owner instruction to finalize the past-due approach first.
