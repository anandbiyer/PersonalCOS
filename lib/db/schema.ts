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
/* Type helpers                                                        */
/* ------------------------------------------------------------------ */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Initiative = typeof initiatives.$inferSelect;
export type NewInitiative = typeof initiatives.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;

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
] as const;
