ALTER TABLE "gear" ADD COLUMN "slot" text;--> statement-breakpoint
CREATE UNIQUE INDEX "gear_rig_slot_unique" ON "gear" USING btree ("rig_id","slot") WHERE "gear"."slot" is not null;--> statement-breakpoint
ALTER TABLE "gear" ADD CONSTRAINT "gear_slot_check" CHECK ("gear"."slot" in ('container', 'main', 'reserve', 'aad'));