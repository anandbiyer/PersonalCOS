CREATE TYPE "public"."approval_state" AS ENUM('none', 'pending', 'approved', 'rejected', 'executed');--> statement-breakpoint
CREATE TYPE "public"."capture_source" AS ENUM('text', 'voice', 'image');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('web_push', 'pushover', 'telegram', 'email');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('planned', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."initiative_stage" AS ENUM('idea', 'validated', 'in_dev', 'piloted', 'adopted');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."knowledge_source" AS ENUM('self', 'document', 'researched');--> statement-breakpoint
CREATE TYPE "public"."portfolio" AS ENUM('office', 'personal_dev', 'personal_life');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."reminder_schedule" AS ENUM('one_off', 'daily', 'every_n_hours', 'cron');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('created', 'planned', 'in_progress', 'blocked', 'waiting', 'delegated', 'overdue', 'replanned', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."theme_name" AS ENUM('aurora', 'sunrise');--> statement-breakpoint
CREATE TYPE "public"."trust_tier" AS ENUM('directory', 'first_party', 'community', 'reference');--> statement-breakpoint
CREATE TABLE "audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"change_type" text NOT NULL,
	"prev_value" jsonb,
	"new_value" jsonb,
	"action_taken" text,
	"approval_state" "approval_state" DEFAULT 'none' NOT NULL,
	"trust_tier" "trust_tier"
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"context" text NOT NULL,
	"alternatives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"choice" text,
	"reasoning" text,
	"initiative_id" uuid,
	"task_ids" uuid[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"type" text,
	"status" "event_status" DEFAULT 'planned' NOT NULL,
	"recurrence" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "initiatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"portfolio" "portfolio" NOT NULL,
	"stage" "initiative_stage" DEFAULT 'idea' NOT NULL,
	"outcome" text,
	"heartbeat_at" timestamp with time zone,
	"cadence_days" integer,
	"next_action" text,
	"next_review" timestamp with time zone,
	"knowledge_source" "knowledge_source" DEFAULT 'self' NOT NULL,
	"external_deadline" timestamp with time zone,
	"readiness" integer,
	"stalled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_date" timestamp with time zone,
	"note" text,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"code" text NOT NULL,
	"role" text,
	"initiatives" uuid[],
	"behaviour_to_enable" text,
	"last_nudge" text,
	"motivators" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"target" text NOT NULL,
	"schedule" "reminder_schedule" NOT NULL,
	"schedule_config" jsonb,
	"channel" "channel" DEFAULT 'web_push' NOT NULL,
	"next_fire" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"date" date NOT NULL,
	"overridden_block" text,
	"replacement" text,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"portfolio" "portfolio" NOT NULL,
	"initiative_id" uuid,
	"due_date" timestamp with time zone,
	"priority" "priority" DEFAULT 'normal' NOT NULL,
	"status" "task_status" DEFAULT 'created' NOT NULL,
	"effort_min" integer,
	"recurrence" text,
	"depends_on" uuid[],
	"owner" text,
	"source" "capture_source" DEFAULT 'text' NOT NULL,
	"notes" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text,
	"display_name" text NOT NULL,
	"channels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"theme" "theme_name" DEFAULT 'aurora' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_initiative_id_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiatives"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_initiative_id_initiatives_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiatives"("id") ON DELETE set null ON UPDATE no action;