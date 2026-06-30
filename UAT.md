# UAT — User Acceptance Testing Log

Living log of issues and feature requests raised by the user (Anand) during UAT of the
Personal Chief of Staff app, starting 2026-06-29. The deployed app under test is
https://personal-cos.vercel.app/ (Neon prod DB, per-user Clerk auth).

## How this log is used
- Every UAT observation gets an entry in **Issues & Observations** below.
- Each is triaged as a **Defect** (existing behaviour wrong/missing) or an **Enhancement /
  New Requirement** (capability not in the original spec).
- **New requirements** are additionally recorded in **New Requirements from UAT** and
  reflected into the authoritative spec
  (`Req_Design Docs/PersonalChiefOfStaff_Requirements_FINAL_v2.4.docx`) under a clearly
  flagged *"New Requirements based on UAT"* appendix.
- Status values: `Open` · `In Progress` · `Fixed` · `Deferred` · `Won't Do`.

---

## Issues & Observations

| ID | Date | Area | Type | Description | Status | Resolution |
|----|------|------|------|-------------|--------|------------|
| UAT-1 | 2026-06-29 | Capture / Calendar | Defect (gap) | Captured tasks landed in the ledger but never appeared on the Calendar, because capture never set a `due_date` and the calendar only renders dated items. | Fixed | Natural-language date extraction added to capture (`lib/capture/extract-date.ts`). Commit `ae92c2a`. See NR-UAT-1. |
| UAT-2 | 2026-06-29 | Capture / Calendar | Enhancement | Date-only tasks (bill / rent / credit-card payments) have a date but no time, and should appear as a timed "due by" activity rather than all-day. Requested default time: 9pm. | Fixed | Date-only captures default to 21:00 (`DEFAULT_DUE_MINUTES`). Commit `38bb305`. See NR-UAT-2. |
| UAT-3 | 2026-06-29 | Platform / Dates | Enhancement | App rendered all dates/times in server-local (UTC) with no per-user timezone conversion; the user is in Atlanta while the default user timezone is `Asia/Kolkata`. Calendar showed wrong day labels / "today". Wanted: dates based on the accessing device's timezone (mobile vs laptop). | Display done | All display surfaces now device-tz: capture (`1a2d4ca`), calendar (`1a2d4ca`), brief (`dfc170e`), tasks list + reports (`012ced1`). Remaining (separate concern): reminder/notification *scheduling* timing — cron-driven, needs `users.timezone`, not device tz. See NR-UAT-3. |
| UAT-4 | 2026-06-29 | Brief / Dates | Defect (instance of UAT-3) | Brief showed two conflicting dates: top bar "Mon Jun 29 22:13" (device tz) vs brief hero "Good morning, Tuesday June 30" (server UTC). Cause: the brief was server-rendered, so its date, greeting, and AM/PM mode came from UTC `new Date()` (10pm EDT = 2am UTC next day). | Fixed | Brief now composes in the device tz client-side; greeting/date/mode/counts all local. LLM narration moved to `/api/brief/narrate`. Commit `dfc170e`. |

---

## New Requirements from UAT
These are reflected into the Requirements v2.4 doc
(`Req_Design Docs/PersonalChiefOfStaff_Requirements_FINAL_v2.4.docx`) under **Addendum v2.4.2 —
New Requirements based on UAT**, flagged `(new, UAT)`.

| Req ID | Spec FR | Title | Summary | Status |
|--------|---------|-------|---------|--------|
| NR-UAT-1 | FR40 | Natural-language due-date extraction at capture | Capture must parse dates/times from the original text ("by July 5, 2026", "7-8pm", "tomorrow", "friday", "in 3 days", ISO) and set the task `due_date`, so dated captures flow onto the calendar. Deterministic; runs identically online/offline. | Implemented (`ae92c2a`) |
| NR-UAT-2 | FR41 | Default deadline time for date-only captures | A capture with a date but no explicit time defaults to a 9pm (21:00) deadline, so deadline-style tasks (bills, rent, credit-card payments) surface as a timed reminder slot rather than an all-day block. | Implemented (`38bb305`) |
| NR-UAT-3 | FR42 | Device-timezone-aware date/time handling | Interpret, store, display, and schedule using the accessing device's timezone (each device shows its own local time). | Display complete — capture (`1a2d4ca`), calendar (`1a2d4ca`), brief (`dfc170e`), tasks list + reports (`012ced1`) all device-tz. Remaining: reminder/notification *scheduling* (cron-side, keyed on `users.timezone` rather than device — a distinct piece, only relevant once notifications are turned on). |

---

## Known Limitations / Watch-list
- **Timezone (NR-UAT-3):** see above — the single biggest correctness gap for dates/reminders.
- **9pm default is global** for all date-only captures, not only payment-type tasks (we can't
  classify "payment" reliably without more signal). Revisit if non-deadline dateless tasks
  should stay all-day.

---

## Pending (post-UAT) — Stage C
- Second household user (spouse) signs up → assign Sunrise theme.
- Enable `REQUIRE_AUTH=1` in Vercel to lock the public URL before sharing.
