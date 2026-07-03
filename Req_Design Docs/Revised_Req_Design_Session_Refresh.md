# Personal COS — Daily Session Refresh (fresh chat + day boundary)
## Fix Plan / Revised Requirements & Design (for Claude Code)

**Status of this document:** a corrective increment on top of the deployed build (base + conversational/memory FR43–FR48 + reminders FR49–FR51, live on Vercel + Neon). It fixes the **"beginning-of-day refresh"** of the session thread: the home screen should open a *fresh chat* each day with the prior day's dialogue moved into day-divided scrollback. Today it does not. Written as a delta against the as-built code.

**Why this exists (the observed bug):** the daily-refresh feature is **not working** — opening the app on a new day still shows the previous day's chat inline, with no fresh thread. Investigation confirmed this is **not a cron problem** (the crons are enabled and `cron/brief` at 04:25 UTC does open a new day-session record). The failure is in the **read/display path**: the home screen renders the last 50 turns across *all* conversations and never scopes to the current day's conversation, so rotating the session record has no visible effect.

**FR numbering:** FR1–FR51 are occupied; **FR52** is reserved for the strike-through-resolved-calendar-items follow-up noted in `Revised_Req_Design_Reminders_Calendar.md §8`. This increment takes **FR53–FR54**. Authoritative for this increment.

**Legend:** ✅ already built · 🔧 refactor existing module · 🆕 new build

---

## 0. Root cause (precise)

The session **record** rotates daily but the session **view** ignores it:

1. **Home thread is not conversation-scoped.** `app/(app)/brief/page.tsx:37` loads the thread with `lastTurns(ownerId, 50)`. `lib/db/repo/turns.ts:34` has **no `conversationId` parameter** — it is `ORDER BY created_at DESC LIMIT n` across **every** conversation. So `components/session-view.tsx:263` renders a flat list of the last 50 turns regardless of day.
2. **Opening a new day-session has no display effect.** `lib/session/lifecycle.openDaySession` (`lifecycle.ts:20`) creates a fresh `conversations` row once per day (via `cron/brief` and lazily on first home visit), but **nothing in the render path reads `conversation.id`**, so yesterday's turns keep showing purely because they're still in the most-recent 50.
3. **No day dividers / scrollback.** The FR48 §5.4 spec calls for day-divider separators with older days behind scrollback; `session-view` renders one flat `turns.map(...)` with neither.

Two compounding issues:
- **The morning brief is a notification, not a turn.** `cron/brief` ends with `dispatch({ kind: "brief" })` (`app/api/cron/brief/route.ts:40`), not an appended turn — so the in-thread "opening" is a *static client-side render*, with no persisted first message to anchor a day on.
- **The day boundary is UTC, not local.** `openDaySession` uses `new Date()` + `sameDay(...)` in server (UTC) time (`lifecycle.ts:21-23`), so a "new day" rolls at **00:00 UTC = 20:00 America/New_York**, and `cron/brief` fires at 04:25 UTC = **00:25 EDT** — neither aligns with the owner's local morning.

**Enabling facts (no schema change needed):** `conversation_turns.conversation_id` already exists and is populated (the orchestrator writes every turn with `conv.id`), so conversation-scoped fetching works on existing data. `users.timezone` already exists (though it currently defaults to `Asia/Kolkata` and is **read by no logic**), so a tz-correct day boundary is available once the value is set correctly.

---

## 1. New functional requirements (FR53–FR54)

| FR | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| **FR53** | **Daily session refresh (conversation-scoped home).** The home thread shows only the **current day-session's** turns; a new day opens a fresh (empty) thread. Prior days are not shown inline — they move to **day-divided scrollback** / history (FR48). | Must | The core fix. Reuses the existing per-day `conversations` rows + `conversation_turns.conversation_id`. |
| **FR54** | **Timezone-correct session-day boundary.** "A new day" is computed in the **owner's timezone** (`users.timezone`), not server UTC, so the fresh-chat rollover lands at local midnight and `cron/brief` opens the day in early local morning. | Must | No schema change; `users.timezone` must be set correctly per tenant (currently a stale `Asia/Kolkata` default). |

### Refinements to existing FRs
- **FR44 (daily working session)** 🔧 → the session *record* rotation now actually drives the *view*: home renders the current session only; the "Open" is the fresh thread + greeting + plan.
- **FR48 (scrollback / day dividers)** 🔧 → completes the spec: prior-day dialogue is reachable behind day dividers rather than dumped inline (or omitted from the inline thread in the minimal build).
- **FR25/FR44 (the brief as the "Open")** 🔧 (optional, see §3.4) → optionally persist the morning brief as a COS turn in the new conversation so the fresh thread has a real opening message, not only a client-side static greeting + a dispatched notification.

---

## 2. Changes to the current build (refactor map)

| Change | Type | Detail |
|--------|------|--------|
| `lib/db/repo/turns.ts` | 🔧 | Add a conversation-scoped fetch: either extend `lastTurns(ownerId, n, conversationId?)` or add `turnsForConversation(ownerId, conversationId, n)`. Ordered oldest-first like today. |
| `app/(app)/brief/page.tsx` | 🔧 | After `openDaySession`, fetch `currentConversation(ownerId)` and load **only that conversation's** turns for the inline thread (not `lastTurns(…,50)` across all). Pass prior days separately (or omit inline) for scrollback. |
| `lib/session/lifecycle.ts` (`openDaySession`) | 🔧 | Compute "same day" in the owner's tz (`users.timezone`) via a tz-aware day comparison, not server-UTC `sameDay`. |
| `lib/planner/dates.ts` **or** a small helper | 🆕 | `sameDayInTz(a, b, tz)` (Intl-based) for the owner-tz day boundary. (`extract-date.partsInTz` has the pattern but is private/capture-scoped.) |
| `components/session-view.tsx` | 🔧 | Render a **day-divider** separator between conversations when prior days are shown; handle a **zero-turn** current day gracefully (greeting + plan + composer only — the fresh chat). |
| `vercel.json` (`cron/brief` schedule) | 🔧 (ops) | Pick a UTC time that lands in early **local** morning year-round (DST caveat); or rely on lazy `openDaySession` for the exact rollover and keep cron as the proactive brief. |
| Data / settings | 🔧 (ops) | Set `users.timezone` to each tenant's real zone (e.g. `America/New_York`), since it defaults to `Asia/Kolkata` and drives FR54. |

**No schema migration** — `conversation_turns.conversation_id` and `users.timezone` already exist.

---

## 3. Design detail

### 3.1 Conversation-scoped home thread (FR53) — the core fix
`brief/page.tsx` already calls `openDaySession(ownerId)` (idempotent). Change the thread source from "last 50 turns globally" to "**this day-session's** turns":
```
await openDaySession(ownerId)
const conv  = await currentConversation(ownerId)          // today's session record
const turns = conv ? await turnsForConversation(ownerId, conv.id, 200) : []
// pass `turns` to <SessionView> as the inline thread
```
On a new day, `conv` is the freshly-opened row with **no turns** → the thread renders greeting + plan + composer only = the fresh chat. Yesterday's turns belong to yesterday's conversation and are no longer inline. Because turns have carried `conversation_id` since the conversational increment shipped, this works on existing data (legacy turns with a null `conversation_id`, if any, simply fall outside every day-scope — acceptable).

### 3.2 Day-divided scrollback for prior days (FR48)
Two build depths — pick per §5 decision:
- **Minimal (satisfies the complaint):** inline thread = current day only; prior days are reachable via the existing **Memory view** / a "previous days" affordance. This alone delivers "fresh chat comes up + previous day moved away."
- **Fuller (completes FR48 §5.4):** render prior conversations above the current one, each under a **day-divider** header, lazily loaded on scroll-up; days past the verbatim-retention window show their **summary** (T2) instead of raw turns.

### 3.3 Timezone-correct day boundary (FR54)
Replace the UTC `sameDay` check in `openDaySession` with an owner-tz comparison:
```
const tz = ownerTimezone(ownerId)                         // users.timezone
if (conv && sameDayInTz(conv.startedAt, now, tz)) return false
```
Effect: the new conversation opens at **local** midnight, so the fresh-chat rollover matches the owner's day rather than flipping at 20:00 local. `cron/brief` remains a proactive opener; because `openDaySession` is idempotent and also runs lazily on first home visit, the correct fresh session appears on the first morning visit even if cron timing is imperfect. **Set `users.timezone` correctly** (currently `Asia/Kolkata` default) — otherwise FR54 computes the wrong day.

### 3.4 (Optional) Persist the brief as the opening turn
Today `cron/brief` only `dispatch()`es the brief (a notification) and the in-thread greeting is a static client render. Optionally append the brief greeting/prose as a **COS turn** into the new conversation, so the fresh thread has a real, persisted first message (truer to FR44 "the COS opens the day") and the opening is recoverable. Trade-off: adds one stored turn/day; keep it out of retention pruning like other COS turns. Flagged as a decision, not required for the fix.

---

## 4. Edge cases & guardrails
- **Empty current day:** `SessionView` must render cleanly with zero turns (greeting + plan + composer). It already draws the greeting unconditionally; verify no assumptions on a non-empty `turns`.
- **Legacy/null `conversation_id` turns:** excluded from every day-scope — acceptable (old rows), and they still exist in the ledger/Memory.
- **Retention interplay (NFR-5/FR47):** scoping only changes what's shown *inline*; prior-day turns remain retained per `retention_days` and reachable via scrollback/Memory until they age out — no data is deleted by this change.
- **Idempotency:** `openDaySession` stays idempotent within a single owner-tz day (two visits the same local day must not open two conversations).
- **DST:** a fixed-UTC `cron/brief` drifts ±1h across DST; the lazy tz-correct `openDaySession` is the source of truth for the actual rollover, so cron drift only shifts *when the proactive brief is pushed*, not *which day is fresh*.
- **Two tenants:** each owner's day boundary uses their own `users.timezone`; the household's two users can be in different zones without interfering (RLS already isolates turns/conversations).

## 5. Decisions to confirm before build
1. **Scrollback depth:** minimal (current day inline; prior days via Memory) **vs** full day-divider scrollback now (FR48 §5.4). *Recommend: minimal first (fixes the complaint), full as a fast-follow.*
2. **Persist the brief as a turn (§3.4)?** *Recommend: yes — gives the fresh thread a real opening and matches FR44; low cost.*
3. **Owner timezone value(s):** confirm the correct `users.timezone` per tenant (e.g. `America/New_York` for the Atlanta owner) and how it's set (settings control vs one-time data fix).
4. **Local refresh hour:** what local time should the day "refresh" / brief post (e.g. ~5–6am local)? Drives the `cron/brief` UTC schedule.

## 6. Build order
1. **FR53 core: ✅ DONE.** Added `turnsForConversation(ownerId, conversationId, n)` (`lib/db/repo/turns.ts`); `app/(app)/brief/page.tsx` now scopes the inline thread to `currentConversation`'s turns instead of `lastTurns(…,50)` across all conversations. `SessionView` already renders greeting + plan + composer independent of `turns`, so a zero-turn day is the fresh chat — no component change needed. 3 new tests in `tests/phase9/session-refresh.test.ts` (scoping, fresh-day = zero turns, RLS isolation). Full suite 245 green; build green. **Confirmed decision:** minimal scrollback first (current day inline; prior days via Memory / a later day-divider build).
2. **FR54: ✅ DONE.** Added `sameDayInTz(a, b, tz)` (`lib/planner/dates.ts`); `openDaySession` now compares against the owner's `users.timezone` (via `ownerTimezone`), so the fresh session rolls at **local midnight**, not 00:00 UTC. Timezone default corrected `Asia/Kolkata → America/New_York` in schema (migration `0005_gifted_vision.sql`, `ALTER COLUMN SET DEFAULT`), `adminUpsertUserFromClerk`, and seed; existing rows fixed via a data `UPDATE` (run on prod at deploy). `cron/brief` rescheduled `25 4 * * *` (00:25 EDT) → `0 10 * * *` (10:00 UTC = 5 AM EST / 6 AM EDT — never before 5 AM local). **§3.4 (persist brief as opening turn) built:** `cron/brief` now appends the brief prose as the day's opening COS turn, guarded on a still-empty session (idempotent; never injected mid-chat). 2 new tests (tz boundary + `openDaySession` idempotency/rollover). Full suite 247 green; build green.
3. **FR48 polish:** day-divider scrollback for prior days (+ summary beyond the window). *(Still queued — minimal scrollback per decision #1.)*

## 7. Test plan (deterministic / offline)
- `turnsForConversation` returns only the given conversation's turns, oldest-first.
- Home data path: with turns across two conversations (yesterday + today), the inline thread returns **today's only**; a brand-new day returns **zero** turns.
- `openDaySession`: opens a new conversation when the **owner-tz** day changes; idempotent within the same owner-tz day; boundary at local midnight, not UTC (assert with a fixed `now` near the UTC/local divergence, e.g. 23:30 EDT vs 03:30 UTC).
- `SessionView` renders with zero turns (fresh chat) without error.
- (If §3.4) `cron/brief` appends exactly one opening COS turn into the day's conversation and is idempotent per day.

## 8. Open items
Pending the four §5 confirmations. No schema migration required. Purely read-path + tz-boundary + (optional) one added write; safe to ship behind the existing crons.
