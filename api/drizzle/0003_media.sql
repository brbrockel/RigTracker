CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"url" text NOT NULL,
	"kind" text NOT NULL,
	"caption" text,
	"position" integer DEFAULT 0 NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_owner_type_check" CHECK ("media"."owner_type" in ('rig', 'gear', 'event')),
	CONSTRAINT "media_kind_check" CHECK ("media"."kind" in ('photo', 'video')),
	CONSTRAINT "media_caption_length" CHECK (char_length("media"."caption") <= 200)
);
--> statement-breakpoint
CREATE INDEX "media_owner_idx" ON "media" USING btree ("owner_type","owner_id","position");