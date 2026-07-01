# Personal COS — Test Cases (UAT Pack)

Two test cases per requirement, with the exact **input** to give the COS and the **expected outcome** to verify. Covers the deployed build (FR1–FR42), the conversational + memory increment (FR43–FR48), and the non-functional requirements (NFR-1–NFR-11).

**How to use**
- **Input** = type this to the COS in the conversation (or perform the action described).
- **Expected outcome** = what should happen / what to check.
- **[Verify]** = an inspection/config check rather than a chat message.
- Run as **User A** unless a case says otherwise; hand-off cases need **User A + User B**.
- Because the COS is conversation-first, every action should also produce a **natural-language reply** and (where relevant) an **inline action card** — treat a silent DB write as a fail (FR43).

**Legend:** ✅ built · 🆕 new increment · ⬜ deferred (documented, not yet built)

**Test context (fixed reference, so time-based expectations are reproducible)**
Use these anchors when a case involves time. Adjust to your own device/timezone as needed.
- **Reference "now":** Monday, 1 Sep 2025, **08:00**, device timezone **IST (UTC+05:30)**.
- **Quiet hours:** **21:00 → 06:00** (reminders inside this window are deferred to 06:00).
- **Fixed weekly template (sample):** 04:30–05:30 study block · 07:30–17:00 office · 18:00–19:00 gym/walk · 20:00 family/quiet hours.
- **Notation:** where a case is time-sensitive, the **Input** shows the *time you send it* (e.g., "At 08:00 —") and the **Expected outcome** states the *exact resulting time*.

---

## 0. Build assessment (executability review — 2026-07)

> Reviewed each case against the current code on branch `feat/conversational-upgrade` (orchestrator, domain engines, repos, API routes, and UI screens). This section says **which cases can be run as written and which cannot**, and why. **No implementation was done** — this is an assessment only.

### The single most important lens: the conversational surface routes only 6 intents
The home composer (`/api/orchestrator`) classifies every message into exactly **six intents** and nothing else:

| Intent | What it actually does |
|---|---|
| `task` / `calendar` | `ingestText` → creates **one** task (classify → due-date + duration extraction → file). `calendar` also proposes a re-plan **only if the new timed item clashes** with another timed item that day. |
| `completion` | fuzzy-matches an open task by keywords → marks it done. |
| `status` | returns **counts** (open / due-today / overdue / waiting-on) — not a filtered list. |
| `question` | `consultReply` — a non-directive sounding board that **never files** and does **not** run the structured advise→pick→operationalise flow. |
| `handoff` | returns "confirm in the Inbox" — does **not** itself create the invitation. |

**Consequence:** rich features that are fully built as engines + API routes + screens — **decisions, initiatives, people/waiting-on, reports, advisory options/operationalise, reminder rules, search, study plans, overload/capacity** — are **not reachable by typing to the COS**. Cases phrased as chat inputs for those features **cannot be executed as written**; they must be exercised through their **dedicated screen or API**. Everything is implemented; the gap is the *conversational route*, not the capability.

### Environment prerequisites (gate many "Executable" verdicts on the live app)
- **`ANTHROPIC_API_KEY`** — real intent routing (else deterministic heuristic), consult/advice substance, **fact extraction**, and **day-summaries**. Under `AI_OFFLINE=1` these degrade to deterministic stubs (consult returns a canned line; extract/summary are no-ops).
- **OpenAI** (STT + embeddings) → voice capture + vector retrieval · **Vision** → image capture · **Notion** → FR31 · **Tavily** → FR20 research · **Robinhood connector** → FR34 · **Clerk** → multi-user FR35/36/37/39 (dev falls back to a single dev tenant).

### Time-anchor caveat (FR6 / FR38 / FR9)
The implemented weekly template is **Study 04:30–05:30 · Office 07:30–17:00 · Gym 18:00–20:00 · Family 20:00–21:00 (quiet) · Reading 21:15–22:00 (quiet)**. There is **no blanket 21:00→06:00 quiet window** — quiet-hours are specific template blocks. Recalibrate the exact-time expectations in FR6/FR38 accordingly.

### Legend for the status table
✅ **Executable** as written · 🟡 **Partial** (works with caveats) · 🖥️ **Screen/API-only** (built, but *not* via the chat input specified) · ❌ **Blocked** (not available for this scenario as written) · ⬜ **Deferred**

### Executability status by requirement

| Req | Status | Assessment / what's needed |
|---|---|---|
| **FR1** Capture | ✅ | Works. Note: "*remind me to…*" files a **task**, not a reminder rule (see FR6). |
| **FR2** Classify | ✅ | Portfolio chip + due-date extraction on capture. |
| **FR11** Ledger CRUD | 🟡 | **Create** via chat ✅. **Edit/Delete via chat ❌** — no edit/delete intent (T1/T2 not executable as written). Delete is possible via a just-created card's *undo*, or the `/api/tasks/[id]` API. Persistence/reload ✅. |
| **FR12** Decisions | ❌ | "*record a decision*" files a **task**. Decisions are created only via `advisory/commit` (operationalise) and retrieved only as consult grounding (online). Not executable as written. |
| **FR13** Search | 🖥️ | Use the **Tasks screen search box** (semantic). Chat "*show me…*" hits the `status` intent → counts, not results. |
| **FR14** Audit | ✅ | T1 status-change audit ✅ (complete via chat writes an audit row). T2 due-date edit — no chat edit path; verify via an API edit. |
| **FR18** Notes→actions | ❌ | `ingestText` creates **one** task; it does **not** split a multi-item note into several tasks, nor extract a waiting-on. |
| **FR19** People register | 🖥️ | Create via **People screen/`/api/people`**; chat files a task. T2 "*who am I waiting on*" → status counts (+ **Waiting** screen). |
| **FR29** Multimodal | ✅ | Voice → `/api/capture/voice`, Image → `/api/capture/image`, provenance set. **Needs STT/Vision keys** (offline = no-op). |
| **FR30** Persistent memory | ✅ | Preference persists as a durable **fact** (online extraction; **offline no-op**). Restart persistence ✅ (Postgres). |
| **FR31** Notion notes | ✅ | Via consult with **Notion + AI keys**; office correctly excluded from the connector (T2). |
| **FR3** Initiatives | 🖥️ | **Initiatives screen / API**; chat files a task. Not via chat. |
| **FR4** Calendar plan | 🟡 | Plan is shown on the **home plan card + Calendar screen**. Chat "*what's my plan*" → counts. "*dentist at 11*" adds a **dated task**, not a template-overriding schedule-exception. |
| **FR5** Capacity | ❌ | `detectOverload` exists but is **not wired to chat** and has no direct query screen. Not executable as written. |
| **FR6** Reminders (quiet-hours) | ❌ | Chat "*remind me…*" makes a **dated task, no reminder rule, no quiet-hours deferral**. Rules exist only via **`/api/reminders`** + `fire-reminders` cron. Quiet-hours model also differs from the 21:00→06:00 assumption. |
| **FR7** Missed-task | 🟡 | "*what did I miss*" → overdue **count** (not "~15h overdue"); the brief surfaces overdue items. |
| **FR8 / FR45** Negotiated replan | 🟡 | A revised plan is proposed **only on a real same-day clash** (conflict-gated). With an empty 2 PM slot it files silently. The replan moves backlog to **future days**, not intraday. "*agree*" commits + sets reminders. |
| **FR9** Study plan | 🖥️ | Via **`/api/initiatives/[id]/study-plan`** (needs an initiative); chat files a task. |
| **FR10** Reporting | 🖥️ | **Reports screen** shows completion %, variance, at-risk. Chat "*how did this week go*" → consult prose. |
| **FR22** Overload/conflict | ❌ | Same as FR5 — engine exists, not chat-reachable, no direct screen. |
| **FR23** Waiting-on | 🟡 | Surfaces on the **Waiting** screen + status counts. Creating a proper waiting-on (person link + age) via chat is not wired. |
| **FR24** Slippage | 🖥️ | **Reports** at-risk/slippage (T2) ✅; chat "*what's at risk*" (T1) not wired. |
| **FR25** Daily briefing | 🟡 | AM plan is **proactively** shown on session open ✅ (FR44). PM sweep is **cron-driven** (`cron/sweep`), not chat-triggered. |
| **FR28** Calendar views | ✅ | Hour-grid **Day** + **Week**, switchable, device-tz. |
| **FR38** Interval reminders | ❌ | Rules via **`/api/reminders`** only (`computeNextFire` supports interval/daily); chat files a task. |
| **FR40** NL due-date | ✅ | Extracted at capture (next-occurrence, 9 PM default). |
| **FR41** 9 PM default | ✅ | Date-only → 21:00 timed "due by". |
| **FR42** Device-tz | ✅ | Display is device-local (client-rendered). Reminder **timing** 🟡. |
| **FR15** Advisory | 🖥️ | **Advisory panel / `/api/advisory(/commit)`**; chat `question` → consult prose (no structured options, never operationalises). |
| **FR16** Stage gates | 🖥️ | Invariant + **Initiatives API**; chat not wired. |
| **FR17** Momentum/stall | 🖥️ | `cron/initiative-review` + Initiatives/brief; chat not wired. |
| **FR20** Research | 🟡 | Consult prose (online). True web research via **advisory + Tavily** (screen/API). |
| **FR21** Re-validation | 🟡 | `knowledge_source` flag + advisory re-check (Verify/cadence); not a direct chat action. |
| **FR26** Approval-first | ✅ | High-stakes handoff → confirm (T1); low-stakes "*mark done*" executes (T2). |
| **FR27** Preference/estimation learning | ❌ | Preferences are **stored** (online) but **not applied** to scheduling; estimate calibration is not implemented. |
| **FR33** Consult gate | ✅ | Advice doesn't file (T1); "*add a task…*" files (T2). Consult substance needs AI online; the gate is correct offline. |
| **FR34** Investments | ✅ | **Invest screen** (needs Robinhood connector); read-only enforced at the connector (allowlist + deny-pattern). Chat can't place a trade at all. |
| **FR35** Multi-tenancy | ✅ | Needs 2 users; RLS isolates. |
| **FR36** Clerk auth | ✅ | Needs Clerk configured (prod). |
| **FR37** Hand-off | ✅ | Chat handoff → confirm → **Inbox compose**; User B accepts/declines (copy-on-accept). |
| **FR39** Theme | ✅ | Per-user aurora/sunrise. |
| **FR43** Orchestration | ✅ | Intent routing + reply + action card. |
| **FR44** Daily session | ✅ | Proactive greeting + plan on open; multi-turn thread. Sweep is cron. |
| **FR46** Tiered memory | ✅ | Online: consult grounded by summary/ledger + durable facts; token log bounded (T3). **Offline: extraction/summary are no-ops.** |
| **FR47** Retention | ✅ | Slider warns; retention cron purges out-of-window/pruned turns; completion-pruning. |
| **FR48** Memory view | 🟡 | View + **delete** a fact ✅. **Edit a fact ❌ in the UI** (only "remove"; the `/api/memory/facts/[id]` PATCH exists but isn't surfaced). |
| **NFR-1** Coded office refs | ❌ | No **automatic client-name coding** at capture was found — the classified title is stored verbatim. Office content is kept **local** (NFR-2/8 enforced), but pseudonymization appears unimplemented. **Verify / likely gap.** |
| **NFR-2** Connector boundary | ✅ | `assertNotOffice`; `AI_OFFLINE=1` deterministic fallback. |
| **NFR-3** Encryption | ✅ | AES-256-GCM connector tokens; owner-scoped. |
| **NFR-4** Durable/backup | 🟡 | Persistence ✅; Neon backups + restore drill are **ops/config** (manual verify). |
| **NFR-5** Retention/retrieval | ✅ | Durable record retrievable; archive-not-delete. Chat retrieval via consult (online). |
| **NFR-6** Latency/no-friction | ✅ | Rapid captures; nothing dropped. |
| **NFR-7** RLS | ✅ | Zero rows without owner ctx; `pcos_app` non-BYPASSRLS. |
| **NFR-8** Connector trust | ✅ | Robinhood allowlist/deny-pattern; `assertNotOffice`. |
| **NFR-9** Identity vs data | ✅ | Clerk = identity; data in Postgres; delete-sync webhook. |
| **NFR-10** Bounded cost | ✅ | `MEMORY_CONTEXT_TOKEN_CAP` in `buildContext`; per-turn `memory.turn_cost` audit; Haiku routing; conditional retrieval. |
| **NFR-11** UI adherence | ✅ | Conversation-first home, plan card, action cards, one composer; tokens/IA/themes. |
| **FR32** Browser action | ⬜ | Deferred. No explicit graceful-decline — the input is mis-handled as a task/consult rather than clearly declined. |

### Tally
- **✅ Executable as written (chat or UI/Verify):** FR1, FR2, FR14 (T1), FR29, FR30, FR31, FR28, FR40, FR41, FR42 (display), FR26, FR33, FR34, FR35, FR36, FR37, FR39, FR43, FR44, FR46, FR47, NFR-2, NFR-3, NFR-5, NFR-6, NFR-7, NFR-8, NFR-9, NFR-10, NFR-11.
- **🟡 Partial / caveated:** FR4, FR7, FR8/FR45, FR11, FR20, FR21, FR23, FR24 (T2), FR25, FR48, NFR-4.
- **🖥️ Built but only via screen/API (not the chat input written):** FR3, FR9, FR10, FR13, FR15, FR16, FR17, FR19.
- **❌ Blocked as written (needs new wiring):** FR5, FR6, FR12, FR18, FR22, FR27, FR38, NFR-1.
- **⬜ Deferred:** FR32.

### If the goal is "run the whole pack conversationally"
The highest-leverage gaps are all about **wiring existing engines to the orchestrator**: add intents/handlers for **reminder rules** (FR6/FR38), **decisions** (FR12), **initiatives + advisory/operationalise** (FR3/FR15/FR16), **people/waiting-on** (FR19/FR23), **reports/at-risk** (FR10/FR24), **search** (FR13), **multi-task note extraction** (FR18), and **edit/delete** of tasks (FR11). NFR-1 (auto-coding office names) is the one true *new-capability* gap.

---

## 1. System of Record

### FR1 — Natural-language task capture ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR1-T1 | `Remind me to submit the Client F workbook` | A task is created in the ledger with a conversational confirmation; provenance = text; nothing is silently dropped. |
| FR1-T2 | `pick up dry cleaning` (all lowercase, no punctuation) | Task captured and normalized (e.g., "Pick up dry cleaning"); appears in Tasks; classified to Personal Life. |

### FR2 — Auto classification (portfolio) ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR2-T1 | `Prepare the board deck for Client M by Thursday` | Classified **Office**; visible with an office chip. |
| FR2-T2 | `Book badminton court for Saturday` | Classified **Personal Life** (not Office); correct portfolio chip. |

### FR11 — Persistent ledger + CRUD ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR11-T1 | Create a task, then: `change the dry cleaning task to due Friday` | Edit persists; reload the app → task still present with the new due date. |
| FR11-T2 | `delete the badminton task` | Task removed from the active ledger; deletion recorded in audit (see FR14). |

### FR12 — Decision repository ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR12-T1 | `Record a decision: we're going with Send over Ascend for GSI underwriting` | A decision entry is stored with rationale; retrievable later. |
| FR12-T2 | `what did we decide about the underwriting platform?` | Returns the recorded Send-over-Ascend decision. |

### FR13 — Search & retrieval (structured + vector) ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR13-T1 | `show me everything related to Client F` | Returns all Client-F tasks/notes/decisions (structured match). |
| FR13-T2 | `find that thing about the pilot scope I mentioned` (fuzzy) | Semantic/vector retrieval surfaces the SpreadX pilot-scope item even without exact keywords. |

### FR14 — Audit trail ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR14-T1 | Complete a task, then **[Verify]** the audit log | An audit row records the status change (who/what/when). |
| FR14-T2 | Edit a task's due date, then **[Verify]** the audit log | The field change is captured with before/after. |

### FR18 — Notes-to-action extraction ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR18-T1 | `Notes from the call: send the ERD to the SME, book a follow-up next week, and confirm the data access` | Three distinct tasks are extracted from one note. |
| FR18-T2 | `Met Owner A — agreed he'll scope the pilot, I'll review Friday` | Extracts a waiting-on (Owner A) + a task for you (review Friday). |

### FR19 — People / enablement register ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR19-T1 | `Add Owner A to my people — he leads SpreadX and I enable him with weekly increments` | A people entry is created with role + enablement note. |
| FR19-T2 | `who am I waiting on and what do they need from me?` | Lists people with open items and the enablement/next nudge. |

### FR29 — Multi-modal capture (text/voice/image) + provenance ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR29-T1 | Use the **voice** input: speak "renew car insurance next month" | Transcribed → task created; provenance = voice. |
| FR29-T2 | Upload an **image** of an itinerary/bill | Vision parses it into task(s)/date(s); provenance = image. |

### FR30 — Persistent memory ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR30-T1 | `Remember I prefer deep-focus work before 6 AM`, then in a later session: `when should I schedule study?` | The preference persists across sessions and informs the answer. |
| FR30-T2 | **[Verify]** after a full app restart, prior people/decisions/tasks remain | Memory is durable (Postgres-backed), not session-only. |

### FR31 — Knowledge retrieval over own notes (Notion) ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR31-T1 | `what do my notes say about the CCA-F domains?` (personal/dev) | Retrieves from connected Notion notes. |
| FR31-T2 | `search my notes for the Client F data model` (office) | Office stays in Postgres — Notion is **not** queried for office; no office content sent to the connector (see NFR-2). |

---

## 2. System of Action

### FR3 — Goal & initiative management ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR3-T1 | `Start an initiative: pass the CCA-F certification` | An initiative is created with an outcome and an initial stage. |
| FR3-T2 | `move the SpreadX initiative to In Dev` | Stage transitions correctly and persists. |

### FR4 — Calendar-aware planning (template + exceptions) ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR4-T1 | `what's my plan for today?` | Plan reflects the fixed weekly template (e.g., 04:30 study block). |
| FR4-T2 | `I have a dentist appointment at 11 today` then `what's my plan?` | The exception overrides the template for that slot only. |

### FR5 — Capacity-based scheduling ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR5-T1 | Add 5 sizeable tasks all due tomorrow → `can I fit all of these tomorrow?` | COS schedules against capacity and flags what won't fit. |
| FR5-T2 | `schedule 3 hours of deck prep this week` | Placed into genuinely free capacity, not over a booked block. |

### FR6 — Reminder engine, quiet-hours aware ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR6-T1 | **At 08:00 —** `remind me to call the plumber at 9 PM` | Reminder created for **21:00 today**; because 21:00 is inside quiet hours (21:00–06:00), it is **deferred to 06:00 the next morning** (or suppressed per config) rather than firing at 21:00. |
| FR6-T2 | **At 08:00 (Mon) —** `remind me about the workbook tomorrow at 8 AM` | Reminder scheduled for **Tue 08:00 IST** (outside quiet hours) and **fires at 08:00**, not before. |

### FR7 — Missed-task detection ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR7-T1 | Create a task due **Sun 31 Aug 17:00**; at **Mon 08:00** ask `what did I miss?` | Task flagged **overdue by ~15 hours** (since Sun 17:00). |
| FR7-T2 | Open the morning brief with an overdue item present | Overdue item surfaces at the top of the brief. |

### FR8 / FR45 — Replanning (now **negotiated**) ✅🆕
| # | Input | Expected outcome |
|---|-------|------------------|
| FR8-T1 | **At 08:00 —** `a 2 PM client call just came up` | COS proposes a **revised plan** placing the call at **14:00–15:00** and moving the displaced item (e.g., deck prep → **tomorrow 04:30**), and asks you to agree — it does **not** silently rearrange. |
| FR8-T2 | After the proposal: `agree` | Plan commits; **reminders auto-set** — e.g., **13:45** for the 14:00 call, and one for the moved deck-prep at **tomorrow 04:15**. |

### FR9 — Study-plan generation (backward-planned) ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR9-T1 | **On Mon 1 Sep —** `build me a study plan for CCA-F, exam in 8 weeks` | Backward-planned from **exam ~27 Oct 2025**; topics land in **04:30–05:30** study blocks across 8 weeks, ending before the exam date. |
| FR9-T2 | `I lost this weekend — adjust the study plan` | Plan re-flows remaining topics without dropping any. |

### FR10 — Weekly & monthly reporting ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR10-T1 | `how did this week go?` | Weekly report: completion %, variance, at-risk items. |
| FR10-T2 | `give me the monthly summary` | Monthly rollup across portfolios. |

### FR22 — Overload & conflict detection ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR22-T1 | Stack multiple deadlines on one day → `am I overloaded tomorrow?` | Flags overload with the specific conflict. |
| FR22-T2 | Book two things in the same slot | Detects the calendar conflict and surfaces it. |

### FR23 — Waiting-on tracking + nudge age ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR23-T1 | `I'm waiting on Owner A for the pilot scope` | A waiting-on item is created with an age counter. |
| FR23-T2 | `who should I nudge?` | Lists waiting-on items past a nudge threshold with age. |

### FR24 — Slippage / deadline-risk prediction ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR24-T1 | Create a large task due tomorrow with no progress → `what's at risk?` | Flags it as likely to slip. |
| FR24-T2 | Check `/reports` risk section | At-risk deadlines listed with reasoning. |

### FR25 — Daily briefing (AM plan / PM sweep) ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR25-T1 | **Open at 08:00 —** `good morning` | COS greets and presents **today's (Mon 1 Sep)** plan reflecting the template (04:30 study already past, office block current). |
| FR25-T2 | `let's do the evening sweep` | PM review: what got done, what to confirm, what's waiting. |

### FR28 — Calendar day/week views ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR28-T1 | Open **Calendar → Day** | Hour-grid day view, portfolio-colored, in device timezone. |
| FR28-T2 | Switch to **Week** | 7-day agenda with today highlighted. |

### FR38 — Scheduled / interval reminders ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR38-T1 | **At 08:00 —** `remind me to stretch every 2 hours` | Interval rule created; next fire **10:00**, then **12:00, 14:00, …**; **paused during quiet hours** (no 22:00/00:00/02:00/04:00 pings). |
| FR38-T2 | `remind me every morning at 7 AM to review my plan` | Daily recurring rule; next fire **Tue 07:00 IST**, then each day at **07:00**. |

### FR40 — NL due-date extraction at capture ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR40-T1 | **On Mon 1 Sep —** `submit the workbook by July 5` | `due_date` = **5 Jul (next occurrence, 2026)** at 21:00 (date-only → 9 PM default, FR41); shows on that calendar day. |
| FR40-T2 | **On Mon 1 Sep 08:00 —** `call the bank in 3 days` | `due_date` resolved to **Thu 4 Sep** (today+3), 21:00 default. |

### FR41 — Default 9 PM deadline for date-only captures ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR41-T1 | `pay rent on the 1st` (date, no time) | Due set to **21:00** on the 1st (timed "due by"), **not** all-day. |
| FR41-T2 | **On Mon 1 Sep —** `credit card bill due Friday` | Due **Fri 5 Sep 21:00** (nearest upcoming Friday, 9 PM default). |

### FR42 — Device-timezone-aware dates ✅ (display) / 🟡 (reminder timing)
| # | Input | Expected outcome |
|---|-------|------------------|
| FR42-T1 | **On Mon 1 Sep (device IST) —** `meeting at 3 PM tomorrow`, then view it | Event shows **Tue 2 Sep 15:00 IST** (device local), no UTC flash on load. |
| FR42-T2 | Open the app on a device set to a different timezone | Calendar/brief/tasks render in that device's local time. |

---

## 3. System of Judgment

### FR15 — Advisory mode (options → reasoned pick → operationalise) ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR15-T1 | `how should I approach moving SpreadX into continuous development?` | Returns 2–3 options with trade-offs and a reasoned pick. |
| FR15-T2 | After a recommendation: `go with that` | It's operationalised into tasks/initiative and linked to a decision. |

### FR16 — Initiatives: stage gates + never-empty next action ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR16-T1 | Create an initiative and leave it without a next action | It's flagged **stalled** (never-empty-next-action invariant). |
| FR16-T2 | `set the next action for the KG initiative to "define trigger"` | Stalled flag clears; next action shown. |

### FR17 — Momentum / stall detection ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR17-T1 | Leave an initiative untouched past its heartbeat → `which initiatives are stalling?` | Identifies the stalled initiative with days-since-movement. |
| FR17-T2 | Open the brief after a stall condition | Stalled initiative surfaces proactively. |

### FR20 — Autonomous requirement research ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR20-T1 | `what does the CCA-F exam actually require to pass?` | Researches (live web when keyed) and returns pass criteria/structure. |
| FR20-T2 | `research current LCR reporting changes for MAS` | Returns a researched summary with sourcing. |

### FR21 — Knowledge re-validation cadence ✅🟡
| # | Input | Expected outcome |
|---|-------|------------------|
| FR21-T1 | **[Verify]** an initiative with `knowledge_source = agent-researched` after the cadence window | It's flagged for re-validation with a receipt. |
| FR21-T2 | `re-check the CCA-F requirements are still current` | Re-runs the check (live web when keyed) and updates/reaffirms. |

### FR26 — Approval-first execution + graduated trust ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR26-T1 | Ask for a higher-stakes action (e.g., `send the pilot scope to Owner A`) | COS **confirms first** rather than acting silently. |
| FR26-T2 | A low-stakes action (`mark the workbook done`) | Executes immediately and reports — confirmation scales with stakes. |

### FR27 — Preference & estimation learning ✅🟡
| # | Input | Expected outcome |
|---|-------|------------------|
| FR27-T1 | `I prefer 25-minute focus blocks` then ask it to schedule focus time | New blocks reflect the learned preference. |
| FR27-T2 | **[Verify]** estimate calibration after several completed tasks | Duration estimates trend toward your actuals. |

### FR33 — Conversation-vs-actionable gate + consult mode ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR33-T1 | `should I raise the staffing concern now or wait?` | Treated as **consult** — advice given, **nothing filed** as a task. |
| FR33-T2 | `add a task to raise the staffing concern` | Now treated as actionable — a task **is** created. |

---

## 4. Investments

### FR34 — Investment status (read-only) ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR34-T1 | `how's my portfolio doing?` | Read-only status: value, day change, holdings; from Robinhood connector. |
| FR34-T2 | `sell 10 shares of NVDA` | **Refused** — read-only; no order verbs allowed; explains it can't trade. |

---

## 5. Multi-tenant & hand-off

### FR35 — Multi-tenancy (isolation) ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR35-T1 | As User A: `show all my tasks`; then sign in as User B and repeat | Each sees only their own data — no overlap. |
| FR35-T2 | As User B: `show me Anand's tasks` | Cannot access the other tenant's data (nothing returned / not permitted). |

### FR36 — Clerk auth, individual users ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR36-T1 | Sign in with User A's Clerk identity | Lands in User A's COS; theme/data are User A's. |
| FR36-T2 | Sign out and sign in as User B | Separate account/session — never a shared org login. |

### FR37 — Cross-user hand-off (copy-on-accept) ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR37-T1 | As User A: `send Revathi a task: pick up Aarav at 5 PM` | Creates an invitation to User B; **nothing** lands in User B's ledger yet; A sees "awaiting acceptance." |
| FR37-T2 | As User B: open Inbox → **Accept** | A new task is created in **B's** ledger/calendar; A sees "accepted." Decline → nothing created. |

---

## 6. Theming

### FR39 — Per-user visual theme (aurora / sunrise) ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| FR39-T1 | Sign in as User A | Aurora theme applied via `data-theme`. |
| FR39-T2 | Sign in as User B | Sunrise theme applied; no bleed between users. |

---

## 7. Conversational operating model 🆕

### FR43 — Conversational orchestration (intent routing) 🆕
| # | Input | Expected outcome |
|---|-------|------------------|
| FR43-T1 | `finished the column inventory` | Routed to **completion** → task marked done **and** a conversational reply (not a silent write). |
| FR43-T2 | `dentist Thursday 4 PM` | Routed to **calendar** → event created + reply; no manual mode/portfolio picker used. |

### FR44 — Daily working session 🆕
| # | Input | Expected outcome |
|---|-------|------------------|
| FR44-T1 | **Open at 08:00 —** app launch | COS **proactively** greets and posts **today's** plan as the first messages (session Open) — no prompt needed. |
| FR44-T2 | Continue: add an item, give a status, ask a question in one thread | All handled in a single continuous session; evening sweep closes it. |

### FR45 — Collaborative plan negotiation 🆕
| # | Input | Expected outcome |
|---|-------|------------------|
| FR45-T1 | `something urgent came up at 3 PM` → COS proposes revision → `tweak: keep deck prep today` | COS revises the proposal per your comment and re-presents. |
| FR45-T2 | `agree` on the revised plan | Only now does it commit to the calendar + auto-set reminders; the agreed plan is the one that writes. |

---

## 8. Memory 🆕

### FR46 — Conversation memory (tiered) 🆕
| # | Input | Expected outcome |
|---|-------|------------------|
| FR46-T1 | Have a multi-turn chat, then next day: `what did we land on yesterday?` | Answered from the rolling/day summary + ledger, not by replaying full transcript. |
| FR46-T2 | `remember I like flights that land before noon`, later: `book travel options` | The durable fact influences the response (extracted, not just chatted). |
| FR46-T3 **[Verify]** | Inspect per-turn context/token log | Context stays bounded (~2–3k tokens); completed items are not re-loaded. |

### FR47 — Configurable retention + tiered lifecycle 🆕
| # | Input | Expected outcome |
|---|-------|------------------|
| FR47-T1 **[Verify]** | Settings → set verbatim window to a shorter value | Warns it's destructive; on confirm, transcript beyond the window is purged on next sweep; **summaries kept**. |
| FR47-T2 **[Verify]** | Complete a one-off task; check pruning + never-expire class | The completed task's verbatim turns become prune-eligible early; a durable **fact/decision/recurring** item is **never** expired by any timer. |

### FR48 — Inspectable / editable / deletable memory 🆕
| # | Input | Expected outcome |
|---|-------|------------------|
| FR48-T1 | Open **Memory → "What I remember"** | Shows current summary + durable facts; scrollback has day dividers. |
| FR48-T2 | Edit a wrong fact and delete another | Correction persists; deleted fact no longer influences the COS. |

---

## 9. Non-functional requirements

### NFR-1 — Coded office references ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| NFR-1-T1 | `Acme Bank wants the model validation by Friday` | Stored as a **coded** reference (e.g., "Client A"), not the real name. |
| NFR-1-T2 **[Verify]** | Inspect the stored office task | No verbatim client name in storage; summaries/facts also coded. |

### NFR-2 — LLM / connector data boundary ✅ (with approved deviation)
| # | Input | Expected outcome |
|---|-------|------------------|
| NFR-2-T1 **[Verify]** | Trigger an office task that would use a connector (Tavily/Notion) | `assertNotOffice` blocks office from third-party **connectors**. |
| NFR-2-T2 **[Verify]** | Set `AI_OFFLINE=1` | All cloud-AI paths fall back to deterministic behavior. |

### NFR-3 — Privacy & encryption ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| NFR-3-T1 **[Verify]** | Inspect stored connector tokens | Encrypted at rest (AES-256-GCM), not plaintext. |
| NFR-3-T2 **[Verify]** | Inspect data access paths | Owner-scoped; no cross-tenant read of private data. |

### NFR-4 — Durable storage + backup/restore 🟡
| # | Input | Expected outcome |
|---|-------|------------------|
| NFR-4-T1 **[Verify]** | Restart app / redeploy | Data persists (Postgres). |
| NFR-4-T2 **[Verify]** | Confirm managed backups exist (Neon) | Backups present; restore drill documented for go-live. |

### NFR-5 — Retention / full historical retrieval ✅🆕
| # | Input | Expected outcome |
|---|-------|------------------|
| NFR-5-T1 | `find my decision on the underwriting platform from months ago` | Durable record retrievable regardless of verbatim window. |
| NFR-5-T2 **[Verify]** | Confirm tiered lifecycle (§4.6.1) | Durable knowledge never expires; completed tasks archive (not hard-delete); audit preserved. |

### NFR-6 — Capture latency / no-friction ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| NFR-6-T1 | Rapidly capture several items in a row | Each is captured quickly; none silently dropped. |
| NFR-6-T2 | Capture something malformed/ambiguous | Still captured (never lost); COS asks to clarify if needed. |

### NFR-7 — Multi-tenant isolation via RLS ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| NFR-7-T1 **[Verify]** | Query without owner context (DB) | Returns **zero rows** (policies fail closed). |
| NFR-7-T2 **[Verify]** | Confirm app connects as non-`BYPASSRLS` role | App uses `pcos_app` (pooled); migrations use owner role only. |

### NFR-8 — Connector trust & scoping ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| NFR-8-T1 | `buy 5 shares of AAPL` | Blocked by the Robinhood read-only allowlist / deny-pattern. |
| NFR-8-T2 **[Verify]** | Attempt an office-scoped connector call | `assertNotOffice` denies it. |

### NFR-9 — Identity vs data separation ✅
| # | Input | Expected outcome |
|---|-------|------------------|
| NFR-9-T1 **[Verify]** | Inspect what Clerk holds vs Postgres | Clerk = login identity only; all app data in Postgres. |
| NFR-9-T2 **[Verify]** | Delete a user in Clerk | Deletion syncs; app data handled per policy. |

### NFR-10 — Bounded memory cost 🆕
| # | Input | Expected outcome |
|---|-------|------------------|
| NFR-10-T1 **[Verify]** | Long-running history, then check token log per turn | Per-turn input stays bounded (~2–3k tokens); doesn't grow with history. |
| NFR-10-T2 **[Verify]** | Confirm routing | Route/summarize/extract use Haiku; retrieval is conditional (skipped for e.g. "mark done"). |

### NFR-11 — UI adherence (binding) 🆕
| # | Input | Expected outcome |
|---|-------|------------------|
| NFR-11-T1 **[Verify]** | Compare home screen to the mockup | Conversation-first home, plan card, inline action cards, one composer — matches the mockup. |
| NFR-11-T2 **[Verify]** | Check tokens/IA/quality floor | Design tokens, nav grouping, `:focus-visible`, reduced-motion, both themes as specified. |

---

## 10. Deferred (documented — expect graceful "not available")

### FR32 — Approval-gated web action (browser) ⬜
| # | Input | Expected outcome |
|---|-------|------------------|
| FR32-T1 | `go book me a table online for Friday` | Gracefully declines / notes browser automation isn't enabled yet (deferred, "Could"). |
| FR32-T2 | `fill in this web form for me` | Same — no silent failure; clearly states it's not available. |

---

### Coverage summary
FR1–FR31, FR33–FR48 (functional), FR32 (deferred, graceful-decline), and NFR-1–NFR-11 — two cases each (a few memory items have a third `[Verify]` check). Cases marked **[Verify]** are inspection/config checks; all others are typed inputs to the COS. Where a requirement is 🟡 partial in the build, the test still states the target behavior so gaps are visible.
