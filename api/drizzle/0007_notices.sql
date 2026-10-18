CREATE TABLE "notice_dismissals" (
	"person_id" uuid NOT NULL,
	"key" text NOT NULL,
	"dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notice_dismissals_person_id_key_pk" PRIMARY KEY("person_id","key")
);
--> statement-breakpoint
CREATE TABLE "notice_reads" (
	"notice_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"read_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	CONSTRAINT "notice_reads_notice_id_person_id_pk" PRIMARY KEY("notice_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"audience" text NOT NULL,
	"recipient_id" uuid,
	"pinned" boolean DEFAULT false NOT NULL,
	"banner_until" timestamp with time zone,
	"author_id" uuid,
	"author_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "notices_audience_check" CHECK ("notices"."audience" in ('everyone', 'person', 'public')),
	CONSTRAINT "notices_recipient_check" CHECK (("notices"."audience" = 'person') = ("notices"."recipient_id" is not null)),
	CONSTRAINT "notices_title_length" CHECK (char_length("notices"."title") <= 100),
	CONSTRAINT "notices_body_length" CHECK (char_length("notices"."body") between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "notice_dismissals" ADD CONSTRAINT "notice_dismissals_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_reads" ADD CONSTRAINT "notice_reads_notice_id_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."notices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_reads" ADD CONSTRAINT "notice_reads_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_recipient_id_people_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notice_reads_person_idx" ON "notice_reads" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "notices_created_idx" ON "notices" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notices_recipient_idx" ON "notices" USING btree ("recipient_id");