ALTER TYPE "public"."email_kind" ADD VALUE 'personal';--> statement-breakpoint
CREATE TABLE "contact_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_id" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"uids" integer[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"gmail_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"uid" integer NOT NULL,
	"message_id_header" text,
	"in_reply_to" text,
	"references" text,
	"from_email" text DEFAULT '' NOT NULL,
	"from_name" text,
	"to" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cc" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"participants" text[] DEFAULT '{}' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"text_body" text DEFAULT '' NOT NULL,
	"html_body" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"labels" text[] DEFAULT '{}' NOT NULL,
	"outgoing" boolean DEFAULT false NOT NULL,
	"seen" boolean DEFAULT false NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_sync" (
	"id" integer PRIMARY KEY NOT NULL,
	"account" text NOT NULL,
	"mailbox" text NOT NULL,
	"uid_validity" text NOT NULL,
	"last_uid" integer DEFAULT 0 NOT NULL,
	"backfill_before_uid" integer NOT NULL,
	"backfill_done" boolean DEFAULT false NOT NULL,
	"highest_modseq" bigint,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"requested_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "company" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "job_title" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN "cc" text;--> statement-breakpoint
ALTER TABLE "contact_notes" ADD CONSTRAINT "contact_notes_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_notes_contact_idx" ON "contact_notes" USING btree ("contact_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mail_messages_gmail_id_unique" ON "mail_messages" USING btree ("gmail_id");--> statement-breakpoint
CREATE INDEX "mail_messages_thread_idx" ON "mail_messages" USING btree ("thread_id","date");--> statement-breakpoint
CREATE INDEX "mail_messages_date_idx" ON "mail_messages" USING btree ("date");--> statement-breakpoint
CREATE INDEX "mail_messages_uid_idx" ON "mail_messages" USING btree ("uid");--> statement-breakpoint
CREATE INDEX "mail_messages_participants_idx" ON "mail_messages" USING gin ("participants");