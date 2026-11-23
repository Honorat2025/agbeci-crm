ALTER TABLE "contacts" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "linkedin_url" text;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_linkedin_unique" ON "contacts" USING btree ("linkedin_url");