# CLAUDE.md — Personal Chief of Staff (Dev Brief)

> Private, single-user agent that manages **Office, Personal Development, and Personal Life** through one natural-language entry point. Build per **Design Document v1.0** (Requirements Spec v2.2).

## What it is
Three layers working as one ledger:
- **System of Record** — capture & never lose anything (tasks, initiatives, people, decisions, events, audit).
- **System of Action** — plan against a fixed weekly template, remind, replan, brief, show a calendar.
- **System of Judgment** — recommend → confirm → operationalise; drive initiatives to outcomes.

## Stack (Vercel-native)
- **Next.js (App Router, TypeScript)** on Vercel — UI + API route handlers
- **Clerk** auth — individual users (email / Google / passkey), **not Organizations**; webhook syncs users → DB
- **Tailwind CSS + shadcn/ui** — reproduce the bright mockup (design tokens below)
- **Drizzle ORM + Vercel Postgres (pgvector + Row-Level Security)** — durable store, vector search, **tenant isolation on owner_id**
- **Vercel Cron** — scheduled jobs + interval reminders; **Vercel Blob** — captured images
- **Anthropic API** — classification, advisory reasoning, Claude Vision; STT for voice
- **MCP connector layer** — Calendar/Gmail/Drive, memory, notes, fetch, approval-gated browser, official Robinhood (read-only)
- **Web Push (VAPID)** primary for notifications; Pushover / Telegram / email per user

## Data model (Postgres)
`tasks` (id, name, portfolio, initiative_id, due_date, priority, status, effort_min, recurrence, depends_on[], owner, source[text|voice|image], notes, completed_at) ·
`initiatives` (id, name, portfolio, stage, outcome, heartbeat, next_action, next_review, knowledge_source, external_deadline, readiness, stalled) ·
`people` (id[coded], role, initiatives[], behaviour_to_enable, last_nudge, motivators) ·
`decisions` (id, context, alternatives, choice, reasoning, initiative_id, task_ids[]) ·
`events` (id, date, type, status, recurrence) ·
`schedule_exceptions` (id, date, overridden_block, replacement, source) ·
`audit` (id, ts, change_type, prev_value, new_value, action_taken, approval_state, trust_tier) ·
`embeddings` (id, entity_type, entity_id, vector) ·
`users` (id, clerk_id, display_name, channels, timezone) ·
`invitations` (id, sender_id, recipient_id, title, due_date, note, status) — **only cross-tenant row** ·
`reminder_rules` (id, owner_id, target, schedule, channel, next_fire, active)
**Every table carries `owner_id`; RLS policies on `owner_id` enforce isolation.**

## Build order
1. App shell + single-user auth + Postgres schema + Drizzle migrations.
2. **Multi-modal capture** (text / voice→STT / image→Blob→Vision) → classify to portfolio → ledger **with provenance**. UI = the bright mockup: three-mode left nav, pinned capture bar, top bar with current date.
3. **Planner**: weekly template + `schedule_exceptions`; **calendar** day (hour grid) + week (agenda), colour-coded by portfolio.
4. **Reminders + Cron**: `cron/brief` (04:25), `cron/reminders` (hourly), `cron/sweep` (21:45), `cron/initiative-review` (weekly), `cron/revalidate` (weekly).
5. **Advisory loop**: 2–3 options + reasoned pick → confirm → decompose into tasks/initiative + link decision. **Initiatives** with stage gates (Idea→Validated→In Dev→Piloted→Adopted). Plus **Consult mode**: a "just chat" sounding-board that talks and advises **without classifying or filing** (FR33).
6. **MCP connectors**: memory, notes (Obsidian local / Notion), fetch/search, approval-gated browser, and **official Robinhood read-only** for portfolio status (FR34).

## Guardrails (do not violate)
- **Tenant isolation via Postgres RLS on `owner_id`** — never rely on app-layer filtering alone; the DB must refuse to return another tenant's rows.
- **Clerk = individual users, NOT Organizations.** Clerk holds only login identity; all app data stays in our Postgres.
- **Hand-off is the only cross-tenant object** — copy-on-accept, carries only the sender's typed fields; sender sees accept/decline status only, never the recipient's data.
- **Notification channels are per-user** — a reminder/hand-off reaches exactly one tenant.
- Office items stored as **coded references** (e.g. `Client F — column inventory`); never verbatim client detail.
- Office portfolio uses **local connectors only** — never a third-party cloud server.
- **No connector executes payments** — the agent reminds and tracks renewals (e.g. LIC) but never pays.
- **Investments are read-only** — official Robinhood MCP, read scope only; never place or rebalance orders; no agentic-trading account funded; no buy/sell advice, status reporting only (FR34).
- **Consult mode never auto-files** — conversational input is talked through, not classified; capture only on an explicit yes (FR33).
- **Never-empty next action**: any active initiative without `next_action` or `next_review` is flagged `stalled` and surfaced in the daily brief.
- **All state in Postgres** — serverless has no in-memory persistence and an ephemeral filesystem.
- Notifications to **personal channels only**; honour quiet hours (Family 20:00–21:00, Reading 21:15–22:00).

## Design tokens (from the mockup)
- Canvas `#F3F6FE` with soft colour washes · Office `#2D7FF9` · Personal Dev `#8B5CF6` · Personal Life `#13C296`
- Attention: amber `#FB9D2B` · overdue `#F4496D` · blocked `#FB5E9D`
- Type: **Manrope** (UI) + **JetBrains Mono** (data/times) · radius 12–18px · soft colour-tinted shadows
- Quality floor: responsive, `:focus-visible`, `prefers-reduced-motion`, WCAG AA contrast on the bright theme

## Env vars
```
ANTHROPIC_API_KEY=        DATABASE_URL=             BLOB_READ_WRITE_TOKEN=
AUTH_SECRET=  AUTH_ALLOWED_EMAIL=                   CRON_SECRET=
TELEGRAM_BOT_TOKEN=  TELEGRAM_CHAT_ID=    PUSHOVER_TOKEN=  PUSHOVER_USER=    STT_API_KEY=
```

## Conventions
TypeScript strict · Drizzle migrations · API as route handlers · protect cron routes with `CRON_SECRET` · stream or queue long advisory/research runs (don't block a single request).

## Start here
Scaffold the Next.js app, define the Drizzle schema, and build the **capture → classify → ledger** vertical slice end to end. Then layer the calendar and the advisory loop.
