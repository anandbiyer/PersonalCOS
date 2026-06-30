import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  date,
  real,
  vector,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const portfolio = pgEnum("portfolio", [
  "office",
  "personal_dev",
  "personal_life",
]);

export const taskStatus = pgEnum("task_status", [
  "created",
  "planned",
  "in_progress",
  "blocked",
  "waiting",
  "delegated",
  "overdue",
  "replanned",
  "completed",
  "cancelled",
]);

export const priority = pgEnum("priority", ["low", "normal", "high", "urgent"]);

export const captureSource = pgEnum("capture_source", ["text", "voice", "image"]);

export const initiativeStage = pgEnum("initiative_stage", [
  "idea",
  "validated",
  "in_dev",
  "piloted",
  "adopted",
]);

export const knowledgeSource = pgEnum("knowledge_source", [
  "self",
  "document",
  "researched",
]);

export const eventStatus = pgEnum("event_status", [
  "planned",
  "completed",
  "cancelled",
]);

export const invitationStatus = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "declined",
]);

export const approvalState = pgEnum("approval_state", [
  "none",
  "pending",
  "approved",
  "rejected",
  "executed",
]);

export const trustTier = pgEnum("trust_tier", [
  "directory",
  "first_party",
  "community",
  "reference",
]);

export const reminderSchedule = pgEnum("reminder_schedule", [
  "one_off",
  "daily",
  "every_n_hours",
  "cron",
]);

export const channel = pgEnum("channel", [
  "web_push",
  "pushover",
  "telegram",
  "email",
]);

/** Per-user visual theme (FR39). aurora = blue/violet/green, sunrise = yellow/white/orange. */
export const themeName = pgEnum("theme_name", ["aurora", "sunrise"]);

/* ---- Conversational upgrade (FR43–FR48) ---- */
export const conversationPhase = pgEnum("conversation_phase", [
  "open",
  "work",
  "adapt",
  "advise",
  "close",
]);
export const turnRole = pgEnum("turn_role", ["cos", "user"]);
export const factKind = pgEnum("fact_kind", ["preference", "commitment", "fact"]);
export const planState = pgEnum("plan_state", ["proposed", "revised", "agreed"]);

/* ------------------------------------------------------------------ */
/* Shared timestamp columns                                            */
/* ------------------------------------------------------------------ */

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
};

/* ------------------------------------------------------------------ */
/* users — synced from Clerk; powers the household roster              */
/* RLS: a user sees only their own row (id = app.owner_id).            */
/* ------------------------------------------------------------------ */

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkId: text("clerk_id").unique(),
  displayName: text("display_name").notNull(),
  // { webPush?, pushover?, telegram?, email? } — per-user notification channels
  channels: jsonb("channels").$type<Record<string, unknown>>().default({}).notNull(),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  theme: themeName("theme").notNull().default("aurora"),
  // Conversation-memory retention windows (FR47 §4.6.1). Verbatim in days;
  // the other tiers in months. Durable knowledge is never timer-expired.
  retentionDays: integer("retention_days").notNull().default(7),
  completedArchiveMonths: integer("completed_archive_months").notNull().default(12),
  summaryRetentionMonths: integer("summary_retention_months").notNull().default(18),
  ...timestamps,
});

/* ------------------------------------------------------------------ */
/* initiatives — sit above tasks; never-empty next action             */
/* ------------------------------------------------------------------ */

export const initiatives = pgTable("initiatives", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  name: text("name").notNull(),
  portfolio: portfolio("portfolio").notNull(),
  stage: initiativeStage("stage").notNull().default("idea"),
  outcome: text("outcome"),
  // last forward movement (the heartbeat); cadence in days
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
  cadenceDays: integer("cadence_days"),
  nextAction: text("next_action"),
  nextReview: timestamp("next_review", { withTimezone: true }),
  knowledgeSource: knowledgeSource("knowledge_source").notNull().default("self"),
  externalDeadline: timestamp("external_deadline", { withTimezone: true }),
  readiness: integer("readiness"), // 0..100 curriculum coverage / progress
  stalled: boolean("stalled").notNull().default(false),
  ...timestamps,
});

/* ------------------------------------------------------------------ */
/* tasks                                                               */
/* ------------------------------------------------------------------ */

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  name: text("name").notNull(),
  portfolio: portfolio("portfolio").notNull(),
  initiativeId: uuid("initiative_id").references(() => initiatives.id, {
    onDelete: "set null",
  }),
  dueDate: timestamp("due_date", { withTimezone: true }),
  priority: priority("priority").notNull().default("normal"),
  status: taskStatus("status").notNull().default("created"),
  effortMin: integer("effort_min"),
  recurrence: text("recurrence"), // RRULE-ish string or null
  dependsOn: uuid("depends_on").array(),
  // person/stakeholder responsible (coded reference for office)
  owner: text("owner"),
  source: captureSource("source").notNull().default("text"),
  notes: text("notes"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  // Completed one-off tasks archive out of the active/searchable set (FR47
  // §4.6.1) — archive ≠ delete; the row + audit are retained.
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  ...timestamps,
});

/* ------------------------------------------------------------------ */
/* people — enablement register (most sensitive class; coded refs)    */
/* ------------------------------------------------------------------ */

export const people = pgTable("people", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  code: text("code").notNull(), // coded reference, e.g. "Owner A"
  role: text("role"),
  initiatives: uuid("initiatives").array(),
  behaviourToEnable: text("behaviour_to_enable"),
  lastNudge: text("last_nudge"),
  motivators: text("motivators"),
  notes: text("notes"),
  ...timestamps,
});

/* ------------------------------------------------------------------ */
/* decisions — recommendation repository, linked to tasks/initiatives */
/* ------------------------------------------------------------------ */

export const decisions = pgTable("decisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  context: text("context").notNull(),
  alternatives: jsonb("alternatives").$type<unknown[]>().default([]).notNull(),
  choice: text("choice"),
  reasoning: text("reasoning"),
  initiativeId: uuid("initiative_id").references(() => initiatives.id, {
    onDelete: "set null",
  }),
  taskIds: uuid("task_ids").array(),
  ...timestamps,
});

/* ------------------------------------------------------------------ */
/* events                                                              */
/* ------------------------------------------------------------------ */

export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  date: timestamp("date", { withTimezone: true }).notNull(),
  type: text("type"),
  status: eventStatus("status").notNull().default("planned"),
  recurrence: text("recurrence"),
  ...timestamps,
});

/* ------------------------------------------------------------------ */
/* schedule_exceptions — deltas against the weekly template           */
/* ------------------------------------------------------------------ */

export const scheduleExceptions = pgTable("schedule_exceptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  date: date("date").notNull(),
  overriddenBlock: text("overridden_block"),
  replacement: text("replacement"),
  source: text("source"),
  ...timestamps,
});

/* ------------------------------------------------------------------ */
/* audit / receipts                                                    */
/* ------------------------------------------------------------------ */

export const audit = pgTable("audit", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  ts: timestamp("ts", { withTimezone: true }).defaultNow().notNull(),
  changeType: text("change_type").notNull(),
  prevValue: jsonb("prev_value"),
  newValue: jsonb("new_value"),
  actionTaken: text("action_taken"),
  approvalState: approvalState("approval_state").notNull().default("none"),
  trustTier: trustTier("trust_tier"),
});

/* ------------------------------------------------------------------ */
/* embeddings — pgvector retrieval (FR13)                              */
/* ------------------------------------------------------------------ */

export const embeddings = pgTable("embeddings", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  // Anthropic/Voyage embeddings; dimension finalised in Phase 1.
  embedding: vector("embedding", { dimensions: 1536 }),
  // Memory lifecycle (FR47/§4.7): source = turn|fact|summary. Turn-embeddings
  // expire with their turn; fact/summary embeddings follow their durable row.
  source: text("source"),
  expiresWithTurnId: uuid("expires_with_turn_id"),
  ...timestamps,
});

/* ------------------------------------------------------------------ */
/* invitations — the ONLY cross-tenant row (FR37, copy-on-accept)     */
/* RLS: visible to sender OR recipient.                                */
/* ------------------------------------------------------------------ */

export const invitations = pgTable("invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  senderId: uuid("sender_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  recipientId: uuid("recipient_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }),
  note: text("note"),
  status: invitationStatus("status").notNull().default("pending"),
  ...timestamps,
});

/* ------------------------------------------------------------------ */
/* reminder_rules — evaluated each minute by cron (FR38)              */
/* ------------------------------------------------------------------ */

export const reminderRules = pgTable("reminder_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  target: text("target").notNull(), // task/event id or free text
  schedule: reminderSchedule("schedule").notNull(),
  scheduleConfig: jsonb("schedule_config").$type<Record<string, unknown>>(),
  channel: channel("channel").notNull().default("web_push"),
  nextFire: timestamp("next_fire", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

/* ------------------------------------------------------------------ */
/* connector_tokens — per-user encrypted MCP/connector credentials     */
/* (Phase 6, FR34/FR30/FR31). Tokens encrypted at rest; RLS-scoped.    */
/* ------------------------------------------------------------------ */

export const connectorProvider = pgEnum("connector_provider", [
  "robinhood",
  "notion",
  "google",
]);

export const connectorTokens = pgTable("connector_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  provider: connectorProvider("provider").notNull(),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  scopes: text("scopes"),
  status: text("status").notNull().default("connected"),
  ...timestamps,
});

/* ------------------------------------------------------------------ */
/* Conversation memory (FR43–FR48) — session thread + tiered memory    */
/* ------------------------------------------------------------------ */

/** One row per day-session. */
export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  phase: conversationPhase("phase").notNull().default("open"),
  ...timestamps,
});

/** Raw verbatim turns (T1) — the ONLY tier subject to retention + completion-
 *  pruning (FR47). actions_json records what the turn wrote (for undo). */
export const conversationTurns = pgTable("conversation_turns", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  conversationId: uuid("conversation_id").references(() => conversations.id, {
    onDelete: "cascade",
  }),
  role: turnRole("role").notNull(),
  text: text("text").notNull(),
  intent: text("intent"),
  actionsJson: jsonb("actions_json").$type<unknown[]>().default([]).notNull(),
  refsTaskId: uuid("refs_task_id"),
  pruneEligible: boolean("prune_eligible").notNull().default(false),
  ...timestamps,
});

/** Day-summaries (T2) — durable, fully retrievable; roll off ~18 mo (§4.6.1). */
export const conversationSummaries = pgTable("conversation_summaries", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  date: date("date").notNull(),
  summaryText: text("summary_text").notNull(),
  openThreadsJson: jsonb("open_threads_json").$type<unknown[]>().default([]).notNull(),
  ...timestamps,
});

/** Durable facts (T3) — coded; never_expire guards facts/decisions/recurring
 *  from every timer (removable only by explicit user delete, FR48). */
export const memoryFacts = pgTable("memory_facts", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  kind: factKind("kind").notNull(),
  subject: text("subject"),
  value: text("value").notNull(),
  sourceTurnId: uuid("source_turn_id"),
  confidence: real("confidence"),
  active: boolean("active").notNull().default(true),
  neverExpire: boolean("never_expire").notNull().default(true),
  ...timestamps,
});

/** Negotiated plans (FR45) — only an agreed plan writes the calendar. */
export const plans = pgTable("plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  date: date("date").notNull(),
  state: planState("state").notNull().default("proposed"),
  itemsJson: jsonb("items_json").$type<unknown[]>().default([]).notNull(),
  changeLogJson: jsonb("change_log_json").$type<unknown[]>().default([]).notNull(),
  agreedAt: timestamp("agreed_at", { withTimezone: true }),
  ...timestamps,
});

/* ------------------------------------------------------------------ */
/* Type helpers                                                        */
/* ------------------------------------------------------------------ */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Initiative = typeof initiatives.$inferSelect;
export type NewInitiative = typeof initiatives.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type ConversationTurn = typeof conversationTurns.$inferSelect;
export type NewConversationTurn = typeof conversationTurns.$inferInsert;
export type ConversationSummary = typeof conversationSummaries.$inferSelect;
export type MemoryFact = typeof memoryFacts.$inferSelect;
export type NewMemoryFact = typeof memoryFacts.$inferInsert;
export type Plan = typeof plans.$inferSelect;

/** Tables that carry owner_id and are isolated by RLS on app.owner_id. */
export const OWNER_SCOPED_TABLES = [
  "initiatives",
  "tasks",
  "people",
  "decisions",
  "events",
  "schedule_exceptions",
  "audit",
  "embeddings",
  "reminder_rules",
  "connector_tokens",
  "conversations",
  "conversation_turns",
  "conversation_summaries",
  "memory_facts",
  "plans",
] as const;
