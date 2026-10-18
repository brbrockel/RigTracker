CREATE TABLE "auth_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"ip" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "person_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "password_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "failed_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "lockout_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "totp_secret_enc" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "totp_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "totp_last_step" integer;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "recovery_code_hashes" jsonb;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "is_guest" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sign_in_links" ADD COLUMN "purpose" text DEFAULT 'password' NOT NULL;--> statement-breakpoint
CREATE INDEX "auth_attempts_ip_idx" ON "auth_attempts" USING btree ("kind","ip","created_at");--> statement-breakpoint
CREATE INDEX "media_url_idx" ON "media" USING btree ("url");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_person_or_guest" CHECK (("sessions"."person_id" is not null) <> "sessions"."is_guest");--> statement-breakpoint
ALTER TABLE "sign_in_links" ADD CONSTRAINT "sign_in_links_purpose_check" CHECK ("sign_in_links"."purpose" in ('password', 'code_after_password', 'code_after_link'));