CREATE TYPE "public"."conversation_phase" AS ENUM('open', 'work', 'adapt', 'advise', 'close');--> statement-breakpoint
CREATE TYPE "public"."fact_kind" AS ENUM('preference', 'commitment', 'fact');--> statement-breakpoint
CREATE TYPE "public"."plan_state" AS ENUM('proposed', 'revised', 'agreed');--> statement-breakpoint
CREATE TYPE "public"."turn_role" AS ENUM('cos', 'user');--> statement-breakpoint
CREATE TABLE "conversation_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"date" date NOT NULL,
	"summary_text" text NOT NULL,
	"open_threads_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"conversation_id" uuid,
	"role" "turn_role" NOT NULL,
	"text" text NOT NULL,
	"intent" text,
	"actions_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"refs_task_id" uuid,
	"prune_eligible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"phase" "conversation_phase" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" "fact_kind" NOT NULL,
	"subject" text,
	"value" text NOT NULL,
	"source_turn_id" uuid,
	"confidence" real,
	"active" boolean DEFAULT true NOT NULL,
	"never_expire" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"date" date NOT NULL,
	"state" "plan_state" DEFAULT 'proposed' NOT NULL,
	"items_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"change_log_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"agreed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "embeddings" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "embeddings" ADD COLUMN "expires_with_turn_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "retention_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "completed_archive_months" integer DEFAULT 12 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "summary_retention_months" integer DEFAULT 18 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_turns" ADD CONSTRAINT "conversation_turns_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;