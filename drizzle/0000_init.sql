CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'sending', 'sent');--> statement-breakpoint
CREATE TYPE "public"."email_kind" AS ENUM('confirm', 'welcome', 'newsletter', 'test');--> statement-breakpoint
CREATE TYPE "public"."newsletter_status" AS ENUM('none', 'pending', 'subscribed', 'unsubscribed', 'bounced');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'sending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"totp_secret_enc" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"newsletter_status" "newsletter_status" DEFAULT 'none' NOT NULL,
	"consent_at" timestamp with time zone,
	"consent_source" text,
	"consent_ip" text,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"confirm_token_hash" text,
	"confirm_token_expires_at" timestamp with time zone,
	"unsubscribe_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletters" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"preheader" text,
	"body_markdown" text DEFAULT '' NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"origin" text DEFAULT 'manual' NOT NULL,
	"origin_url" text,
	"recipients_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "email_kind" NOT NULL,
	"contact_id" integer,
	"newsletter_id" integer,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"text" text NOT NULL,
	"headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"not_before" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_newsletter_id_newsletters_id_fk" FOREIGN KEY ("newsletter_id") REFERENCES "public"."newsletters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_email_unique" ON "contacts" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_unsubscribe_token_unique" ON "contacts" USING btree ("unsubscribe_token");--> statement-breakpoint
CREATE INDEX "contacts_newsletter_status_idx" ON "contacts" USING btree ("newsletter_status");--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox" USING btree ("status","priority","id");--> statement-breakpoint
CREATE INDEX "outbox_sent_at_idx" ON "outbox" USING btree ("sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_newsletter_contact_unique" ON "outbox" USING btree ("newsletter_id","contact_id");