# Personal COS — Reminders on the Calendar & Smart Reminder Grammar
## Revised Requirements & Design (for Claude Code)

**Status of this document:** the *next increment* on top of the deployed build (base Phases 0–6 + conversational/memory increment FR43–FR48, live on Vercel + Neon). It specifies (a) making **every reminder a first-class, calendar-pinned task**, (b) a **smart reminder grammar** for relative and recurring dates, and (c) a **date slot-fill** flow when a reminder arrives with no date. Written as a delta against `Revised_Req_Design_Conversational_Memory (1).md` and the as-built code.

**Why this increment exists:** a real request — *"Rent payment due on last day of every month. Please set a reminder."* — produced only an **untimed task on the ledger and no reminder rule**. Root cause: `parseReminder()` (`lib/reminders/parse.ts`) understands only `every N hours`, `every <part-of-day>`, and one-off absolute times; "last day of every month" matched none, so the reminder path silently degraded to a plain capture with `dueDate = null`. It therefore appeared on no calendar day and set no nudge. This increment closes that gap and the documented "reminder slot-filling Path B" follow-up.

**FR numbering:** the build occupies **FR1–FR48**; NFRs occupy **NFR-1–NFR-11**. New work is numbered **FR49–FR51**. This document's numbering is authoritative for this increment.

**Legend:** ✅ already built · 🔧 refactor existing module · 🆕 new build

---

## 0. The behavioral shift

> **A reminder is not a note — it is a commitment with a time and a place on the calendar.** Every reminder the manager sets must (1) land on the calendar as a dated task, (2) understand natural relative/recurring dates, and (3) never be filed date-less: if no date can be derived, the COS asks for one.

Three concrete gaps against that target, all observed in the as-built code:
1. **Reminders don't reliably reach the calendar.** One-off reminders file an underlying task only if a clock time parses (`act.ts:208-217`); **recurring reminders create only a `reminder_rules` row and no task at all** (`act.ts:222`), so they never render on the calendar (`calendar/page.tsx` renders tasks with a timed `dueDate`, events, and routine-block exceptions).
2. **The grammar is thin.** No relative-date vocabulary ("last day of the month", "fortnight", "last day of the week") and **no monthly recurrence** — `ReminderScheduleKind` is `one_off | daily | every_n_hours | cron` and `computeNextFire` has no monthly math (`lib/reminders/schedule.ts`).
3. **Date-less requests degrade silently.** A reminder with no derivable date becomes an untimed task with no signal to the manager that the timing was dropped.

This increment reuses the existing engines; it does not replace them. `extract-date.ts`, `parse.ts`, `schedule.ts`, `createReminderRule`, `createTask`, and the reminder cron all remain — extended, not rebuilt.

---

## 1. New functional requirements (FR49–FR51)

| FR | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| **FR49** | **Reminders are calendar-pinned tasks.** Every reminder (one-off or recurring) materializes a dated task carrying a clock time, linked to its reminder rule, so it renders on the Calendar and Tasks surfaces. Recurring reminders materialize the **next concrete instance** and roll forward on fire. | Must | Refines FR6/FR38. The task row and the rule are one logical object; completing/cancelling one resolves both. |
| **FR50** | **Smart reminder grammar (relative + recurring).** The deterministic parser understands: **last day of the month** (→ 28/29/30/31, leap-safe), **fortnight** (→ today + 14 days), **last day of the week** (→ the calendar's last week-day = **Sunday**, since the week is Monday-anchored), and the **recurring** form **last day of every month** (→ new `monthly` schedule). "every"/plural cues select recurrence; "this/the/next" select a single next instance. | Must | Pure, key-free extension to `extract-date.ts` + `parse.ts` + a `monthly` `ReminderScheduleKind`; behaves identically online and offline (NFR-10). |
| **FR51** | **Date slot-fill.** If a reminder request yields no derivable date, the COS asks a single clarifying question ("What date should I set this for?") and interprets the **next** turn as the answer, completing the reminder. A time-boxed pending-slot survives one turn. | Must | This is a *required disambiguation*, not a speculative follow-up — distinct from the FR43 "confirm-and-stop / no leading questions" policy (see §3.4). |

### Refinements to existing FRs
- **FR6 / FR38 (reminders)** 🔧 → every reminder now **pins to the calendar** (FR49) and the grammar broadens (FR50). Quiet-hours deferral is retained but reconciled with the new default time (§3.5).
- **FR41 (9 pm date-only default)** 🔧 → **reminders** adopt a **20:30 default** (both calendar due-time and notification fire-time) so the nudge clears the 21:00 quiet-hours boundary (§3.5). The general date-only capture default (`DEFAULT_DUE_MINUTES = 21:00`) is unchanged; 20:30 is scoped to the reminder path.
- **FR43 (orchestrator, confirm-and-stop)** 🔧 → gains a **narrow, reminder-only** stateful clarification (FR51), consistent with the existing "which task?" clarifications in edit/delete/completion.

---

## 2. Changes to the current build (refactor map)

| Change | Type | Detail |
|--------|------|--------|
| `lib/capture/extract-date.ts` | 🔧 | Add relative-date grammar: last-day-of-month, fortnight (+14d), last-day-of-week (Friday). Key-free, tz-aware, offline-safe — matches the existing pattern. Introduce `REMINDER_DEFAULT_MINUTES = 20*60+30` used by the reminder path (leaves `DEFAULT_DUE_MINUTES` = 21:00 for general capture). |
| `lib/reminders/parse.ts` | 🔧 | Recognize the new grammar; emit `schedule: "monthly"` with `scheduleConfig {day:"last"}` for the recurring "…every month" form; emit one-off `nextFire` for the single-instance forms. Distinguish recurrence via "every"/plural vs "this/the/next". |
| `lib/reminders/schedule.ts` | 🔧 | Add `"monthly"` to `ReminderScheduleKind`; implement `computeNextFire("monthly", {day:"last"}, from)` → last day of the following month at the rule's clock time (leap-safe via `new Date(y, m+1, 0)`). |
| `lib/orchestrator/act.ts` (`reminder` case) | 🔧 | **Always materialize a linked calendar task** for both one-off and recurring reminders; on recurring, materialize only the next instance. Emit `⏰ Reminder set` **and** the `📅 Added` card. When no date derives → return a `needsSlot` result (FR51) instead of degrading to an untimed task. |
| `lib/reminders/fire` (reminder cron) | 🔧 | On firing a `monthly` rule: send the nudge, compute next fire, **materialize the next instance task**, and advance the rule. Idempotent (no double-materialization). |
| `lib/db/repo/reminders.ts` + `tasks.ts` | 🔧 | Link a task to its rule (`tasks.reminder_rule_id` or `reminder_rules.task_id`) so undo/complete/cancel resolve both. |
| `lib/orchestrator/router.ts` + a pending-slot store | 🆕 | Reminder-only slot-fill: persist a bounded pending-reminder; on the next turn, if it parses as a date, complete the reminder; else expire the slot and route the message fresh. |
| Tests | 🆕 | Parser truth-table (leap Feb, month lengths, week/Friday, fortnight), monthly roll-forward, calendar-render assertion, slot-fill continuation, quiet-hours vs 20:30. All under `AI_OFFLINE=1`. |

No UI-spec (§5 of the memory doc) changes: reminders reuse the existing in-thread action cards and the existing Calendar render path. This increment is behavioral/back-end.

---

## 3. Design detail

### 3.1 Relative-date grammar (FR50) — resolution semantics
All computed in the **owner's timezone** (device tz, FR42), stored as a UTC instant, at the reminder default time **20:30** unless the manager gives an explicit clock time. If the resolved instant is already in the past relative to `now`, roll to the next valid occurrence (mirrors the existing "today 9 pm already passed" handling).

| Phrase (case-insensitive) | Kind | Resolves to | Edge handling |
|---|---|---|---|
| `last day of (the\|this) month`, `end of (the\|this) month`, `month end` | one-off | Last calendar day of the current month, 20:30 | `new Date(y, m+1, 0)` → 28/29 (leap-aware) / 30 / 31 automatically. If already past → last day of **next** month. |
| `last day of every month`, `every month('?s)? (end\|last day)`, `monthly on the last day` | **recurring** | New `monthly` rule; next instance = last day of current month 20:30 (else next month) | Recurrence generator; see §3.3. |
| `(in a\|next\|a) fortnight`, `two weeks from (today\|now)`, `in 14 days` | one-off | `now + 14 days`, 20:30 | Standard 14-day meaning (owner-confirmed; supersedes the earlier "15th" reading). |
| `last day of (the\|this) week`, `end of (the\|this) week` | one-off | **Sunday** of the current week, 20:30 | Follows the calendar's Monday-anchored week (`startOfWeek` → last day = `startOfWeek + 6` = Sunday). If today is Sunday-past-time → **next** Sunday. Derive from `startOfWeek`, don't hardcode, so it stays calendar-consistent. |

Explicit clock times still win: "remind me on the last day of the month at 9am" → last day, 09:00 (which, being outside quiet hours, is not deferred).

### 3.2 Monthly schedule kind (FR50) — `computeNextFire`
`ReminderScheduleKind` gains `"monthly"`. `computeNextFire("monthly", {day:"last"}, from)` returns the last day of the **month after** `from`'s month, at `from`'s clock time. Leap/short months are automatic (`new Date(y, m+1, 0)`). Only `{day:"last"}` is in scope for this increment; `{day:<n>}` (e.g. "the 15th of every month") is a trivial future extension but **not** built now.

### 3.3 Reminder → calendar task materialization (FR49) — the core change
A reminder is represented as **two linked rows**: a `reminder_rules` row (the generator/nudge) and a `tasks` row (the concrete, dated, calendar-visible commitment). They are linked so lifecycle stays coherent.

- **One-off reminder:** create the reminder rule (fires the nudge) **and** a dated task at the resolved time. (Today the task is created only when a clock time parses — this makes it unconditional once FR50 supplies a time.)
- **Recurring (`monthly`) reminder:** create the rule **and materialize only the next concrete instance** as a dated task. Do **not** pre-create a horizon of future rows — that clutters the ledger, fights the retention cron, and complicates edit/cancel. This mirrors how the system already separates *generators* (routine templates, rules) from *concrete facts* (ledger rows).
- **Roll-forward on fire:** when the reminder cron fires a monthly rule, it sends the nudge, advances the rule's `nextFire`, and **materializes the following instance**. Idempotency guard (e.g. don't materialize if an instance for that rule+date already exists) prevents duplicates on cron retries.
- **Lifecycle coherence:** completing/cancelling the materialized task, or `undo` on the action card, must also resolve the linked rule (deactivate a one-off; for a recurring instance, cancel that instance but keep the generator unless the manager cancels the series). Undo of the creating turn removes both rows.
- **De-duplication across surfaces:** one logical reminder = one linked pair. It shows once in Tasks (open items) and once on the Calendar (its dated instance); the `reminder_rules` row is machinery, not a third user-visible copy.

### 3.4 Date slot-fill (FR51) — reconciling with "confirm-and-stop"
The FR43 policy bans **speculative** follow-ups ("Anything else? / Should I…?") because the single-turn router can't reliably field the branches they open. FR51 is different: it is a **required disambiguation** with a single expected answer type (a date), of the same family as the existing "Which task did you finish?" (`act.ts:249`) and "Which task should I remove?" (`act.ts:277`) clarifications. Those already ask questions; the **new** part is that the *next* turn must be understood as the answer rather than a fresh intent.

Mechanism (minimal, reminder-scoped):
1. Reminder intent parses no date → `act` returns a `needsSlot` result with the extracted **subject** and any recurrence; the reply asks: *"What date should I set the '{subject}' reminder for?"* Nothing is filed yet.
2. A bounded **pending-reminder** is persisted (owner-scoped, single-slot, short TTL — e.g. expires after ~15 min or at session close).
3. On the next turn, the router checks for a live pending slot **first**. If the message parses as a date/relative date (via the FR50 grammar), complete the reminder (materialize rule + task) and clear the slot. If it clearly parses as a different intent, **discard the slot** and route normally (no nagging).
4. Guardrails: at most one pending reminder at a time; TTL and session-close both clear it; an explicit "never mind" clears it. The slot lives as a **typed `memory_facts` row** (owner-confirmed) — RLS-scoped for free, no new table.

### 3.5 Default time 20:30 vs quiet hours (reconciliation)
Quiet hours are **21:00–06:00** (`quiet-hours.ts:10`); a one-off nudge landing inside is deferred to 06:00 (`deferPastQuietHours`, `act.ts:219`). A 21:00 default would sit exactly on that boundary and get pushed to next morning — wrong for a rent reminder. **Resolution (owner-approved): default reminders to 20:30 for both the calendar due-time and the notification fire-time.** 20:30 is before the window, so no deferral; the calendar time and the nudge time agree. Explicit user times inside quiet hours keep the existing deferral behavior (nothing silently lost). Recurring monthly fires computed at 20:30 are likewise outside the window.

---

## 4. Data model additions
| Table / column | Type | Notes |
|---|---|---|
| `reminder_rules.schedule` | extend enum | add `"monthly"` (config `{day:"last"}`) |
| link column | `tasks.reminder_rule_id` (fk, nullable) **or** `reminder_rules.task_id` | one chosen direction; links the materialized instance to its generator (FR49 lifecycle) |
| typed `memory_facts` row (FR51 slot) | `kind:"pending_reminder"`, subject, recurrence_json, created_at, expires_at | single-slot, TTL'd; **no new table** — inherits RLS via the existing `memory_facts` path |
| constants | `REMINDER_DEFAULT_MINUTES = 20*60+30` | reminder-scoped default; `DEFAULT_DUE_MINUTES` (21:00) unchanged |

The pending slot is a **typed `memory_facts` row** (owner-confirmed), so it needs **no** new owner-scoped table and thus **no** three-array RLS update — it reuses the existing `memory_facts` RLS/`withOwner` coverage. It must be excluded from the never-expire fact class (it is transient by design) and cleared on completion, TTL, or session close.

---

## 5. Edge cases & guardrails
- **Leap February:** last-day-of-month must yield 29 in leap years, 28 otherwise — assert both in tests.
- **"Last day" today:** if the manager sets "last day of the month" **on** the last day and 20:30 has passed, resolve to next month, not silently to a past instant.
- **Timezone:** compute all relative dates in the owner's tz, store UTC (extract-date is already tz-aware).
- **Retention interplay:** the roll-forward step owns regeneration, so a completed monthly instance still yields the next one; the retention cron must **not** archive a monthly generator or its pending next instance. Durable/recurring commitments are already in the never-expire class (memory §4.6.1) — keep monthly rules there.
- **Undo integrity:** undo/complete/cancel resolves both linked rows; never orphan a rule or leave a task pointing at a dead rule.
- **Offline parity:** the whole grammar is deterministic and key-free, so `AI_OFFLINE=1` behaves identically (NFR-10 floor preserved; tests stay hermetic).
- **No silent downgrade:** a reminder must never again become an untimed task without either a resolved date (FR50) or an explicit slot-fill question (FR51).

## 6. Build order for this increment
1. **Grammar + monthly kind (FR50): ✅ DONE.** Extended `extract-date.ts` (relative grammar: last-day-of-month leap-safe, fortnight +14d, last-day-of-week→Sunday; `REMINDER_DEFAULT_MINUTES = 20:30`; `extractDueDate` default-time param; `lastDayOfMonthDue` / `monthlyLastDayNextFire` helpers), `parse.ts` (recurring-monthly detection + one-off 20:30 default + subject cleanup), `schedule.ts` (`monthly` kind + tz-aware `computeNextFire`). Added `monthly` to the `reminder_schedule` pgEnum (migration `0003_faulty_butterfly.sql`, additive `ALTER TYPE … ADD VALUE`; applied to local DB, **pending on Neon** at next deploy). 17 new tests in `tests/phase8/reminder-grammar.test.ts`; full suite 229 green; build green. A "last day of every month" request now creates a real recurring `monthly` reminder rule that fires + reschedules correctly — the calendar-task pin still awaits step 2.
2. **Calendar materialization (FR49): ✅ DONE.** Added `tasks.reminder_rule_id` link (migration `0004_faithful_shard.sql`, additive column + FK `ON DELETE set null`). `act.ts` reminder case rewritten: `one_off` + `monthly` now create the rule **then** a linked dated task at the **intended** time (20:30 default) via `materializeReminderTask` — so the calendar pill and the nudge agree; ambient `every_n_hours`/`daily` stay task-less (preserves the existing "interval nudge = no task" contract). Lifecycle coherence in the repo: `deleteTask` tears down the linked rule (undo leaves no orphan); `setTaskStatus` deactivates a linked **one-off** rule on complete/cancel but keeps a **monthly** series alive (decision #8). Cron roll-forward: `cron/fire-reminders` calls `materializeMonthlyNextInstance` (admin-side, idempotent, copies portfolio/name/effort forward) so each month the next instance is pre-pinned. Calendar render verified: `projectDay` already surfaces any dated task, so the instance shows as a timed 20:30 pill. 6 new tests in `tests/phase8/reminder-calendar.test.ts`; full suite 235 green; build green. Migrations `0003`+`0004` applied to local DB, **pending on Neon** at next deploy (both additive; `tasks` already grants to `pcos_app`, so no new GRANT needed).
3. **Slot-fill (FR51): ✅ DONE.** Date-less reminders no longer file silently — the COS asks for a date and completes on the next turn. Store: a transient internal `memory_facts` row (`sys:pending_reminder`, single-slot, 15-min TTL), hidden from context + the Memory view via a new `INTERNAL_SUBJECT_PREFIX` exclusion in `listFacts` (no new table, no RLS-array change). Ask side: `act.ts` reminder null-branch now sets the slot and asks (`reminderSubject` exported from `parse.ts`); `extractSubject` hardened to strip bare ordinals/weekdays/month-days/relative dates so the remembered subject + task name stay clean. Answer side: `lib/orchestrator/pending.ts` `tryCompletePendingReminder` runs **before** routing in `route.ts` — a date answer completes via the reminder path (reusing FR49 materialization), an explicit cancel clears the slot, a non-date reply drops the slot and defers to normal routing. 7 new tests in `tests/phase8/reminder-slotfill.test.ts` (+ updated the FR51-superseded assertion in `reminders-conversational.test.ts` and UAT `FR1-T1`, which now uses a non-reminder capture phrasing). Full suite 242 green; build green.
   - **Known limitation (documented):** if the manager types a brand-new *timed* command as the very next turn (containing a date word like "today"), it may be absorbed as the slot answer rather than routed fresh. Narrow and undoable; a stronger fresh-intent guard is a future refinement.

## 7. Confirmed decisions (owner-approved, this increment)
1. **Every reminder pins to the calendar as a task** — recurring materializes the next instance and rolls forward. ✅
2. **Fortnight = today + 14 days** (standard). ✅
3. **Last day of the week = the calendar's last week-day = Sunday** (derived from the Monday-anchored `startOfWeek`, not hardcoded). ✅
4. **Last day of the month = leap-aware 28/29/30/31.** ✅
5. **Default reminder time = 20:30** for both calendar due-time and notification fire-time (clears quiet hours). ✅
6. **Date-less reminder → ask for the date** (FR51 slot-fill), never file date-less. ✅
7. **Pending-slot store = a typed `memory_facts` row** (RLS-for-free; no new table / no three-array update). ✅
8. **Cancel scope = the single materialized instance only**, never the series — the recurring generator survives unless the manager explicitly says "cancel the series" (or equivalent). ✅

## 8. Open items
All FR49–FR51 decisions are owner-confirmed and the three build steps are shipped (§6).

### Separate follow-up (owner-requested, NOT in this increment) — FR52 candidate: show, don't hide, resolved calendar items
The calendar projection (`lib/planner/calendar.projectDay/projectWeek`) currently renders any dated task regardless of status, so completed/cancelled tasks still appear as normal pills. **Owner decision:** completed and cancelled tasks should remain visible on the calendar rendered **struck-through** (not removed), so the manager can see that the activity happened / was cancelled. Scope when picked up: pass task `status` (and `completedAt`) into the projected `CalItem`, and style `completed`/`cancelled` items with a strikethrough + muted treatment in `components/calendar-view.tsx` (both day + week views), leaving active items unchanged. Pure-render change; no data model impact.
