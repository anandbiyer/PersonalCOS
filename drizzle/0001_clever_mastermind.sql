CREATE TYPE "public"."connector_provider" AS ENUM('robinhood', 'notion', 'google');--> statement-breakpoint
CREATE TABLE "connector_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"provider" "connector_provider" NOT NULL,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text,
	"expires_at" timestamp with time zone,
	"scopes" text,
	"status" text DEFAULT 'connected' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
