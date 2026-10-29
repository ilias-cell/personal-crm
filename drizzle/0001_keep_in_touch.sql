CREATE TYPE "public"."touch_frequency" AS ENUM('week', 'month', 'quarter', 'year');--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "touch_frequency" "touch_frequency";--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "touch_restarted_at" timestamp with time zone;