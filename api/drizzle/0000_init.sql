CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"resource_id" text NOT NULL,
	"resource_name" text,
	"actor_id" uuid,
	"actor_email" text,
	"actor_name" text,
	"details" jsonb,
	"before" jsonb,
	"after" jsonb,
	"legacy_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"event_date" date,
	"description" text,
	"event_photo_url" text,
	"photo_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"legacy_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "gear" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"serial_number" text,
	"name" text,
	"type" text,
	"date_of_manufacture" date,
	"notes" text,
	"image_url" text,
	"rig_id" uuid,
	"person_id" uuid,
	"legacy_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gear_serial_number_unique" UNIQUE("serial_number"),
	CONSTRAINT "gear_legacy_id_unique" UNIQUE("legacy_id"),
	CONSTRAINT "gear_notes_length" CHECK (char_length("gear"."notes") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text,
	"middle_name" text,
	"last_name" text,
	"email" text,
	"phone" text,
	"address" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dob" date,
	"emergency_contacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"role" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"login_count" integer DEFAULT 0 NOT NULL,
	"last_login_ip" text,
	"last_user_agent" text,
	"legacy_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_legacy_id_unique" UNIQUE("legacy_id"),
	CONSTRAINT "people_role_check" CHECK ("people"."role" in ('admin', 'user', 'viewer'))
);
--> statement-breakpoint
CREATE TABLE "rigs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"number" text,
	"container" text,
	"container_serial_number" text,
	"container_dom" date,
	"main_size" text,
	"main_dom" date,
	"main_serial_number" text,
	"reserve_size" text,
	"reserve_dom" date,
	"reserve_serial_number" text,
	"last_packed" date,
	"rigger_int" text,
	"repack_due" date,
	"aad_type" text,
	"aad_dom" date,
	"aad_serial_number" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"primary_person_id" uuid,
	"notes" text,
	"image_url" text,
	"legacy_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rigs_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"person_id" uuid NOT NULL,
	"csrf_token" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip" text,
	"user_agent" text,
	"legacy_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "sessions_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
CREATE TABLE "sign_in_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"person_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by_email" text,
	"legacy_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sign_in_links_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "sign_in_links_legacy_id_unique" UNIQUE("legacy_id")
);
--> statement-breakpoint
ALTER TABLE "gear" ADD CONSTRAINT "gear_rig_id_rigs_id_fk" FOREIGN KEY ("rig_id") REFERENCES "public"."rigs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gear" ADD CONSTRAINT "gear_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rigs" ADD CONSTRAINT "rigs_primary_person_id_people_id_fk" FOREIGN KEY ("primary_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sign_in_links" ADD CONSTRAINT "sign_in_links_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_resource_idx" ON "audit_log" USING btree ("resource","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "gear_rig_idx" ON "gear" USING btree ("rig_id");--> statement-breakpoint
CREATE INDEX "gear_person_idx" ON "gear" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "people_sign_in_email_unique" ON "people" USING btree (lower("email")) WHERE "people"."role" is not null;--> statement-breakpoint
CREATE INDEX "rigs_primary_person_idx" ON "rigs" USING btree ("primary_person_id");--> statement-breakpoint
CREATE INDEX "sessions_person_idx" ON "sessions" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sign_in_links_person_idx" ON "sign_in_links" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "sign_in_links_expires_idx" ON "sign_in_links" USING btree ("expires_at");