CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_emails" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "login_emails_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "contacts_created_at_idx";--> statement-breakpoint
DROP INDEX "groups_name_lower_idx";--> statement-breakpoint
-- Hand-written part: existing contacts and groups go to the owner (the user with the email from OWNER_EMAIL).
-- The columns are added without NOT NULL first, filled in, and only then made required.
ALTER TABLE "contacts" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "owner_id" text;--> statement-breakpoint
-- The migration runner passes the owner email as the session setting crm.owner_email.
-- Notes and group memberships need no owner: they belong to the owner of their contact.
-- Raising an error here undoes the whole migration, so the database stays as it was.
DO $$
DECLARE
  owner_email text := lower(btrim(coalesce(current_setting('crm.owner_email', true), '')));
  owner_user_id text;
  moved_contacts bigint;
  moved_groups bigint;
BEGIN
  IF NOT (EXISTS (SELECT 1 FROM "contacts") OR EXISTS (SELECT 1 FROM "groups")) THEN
    RETURN;
  END IF;
  IF owner_email = '' THEN
    RAISE EXCEPTION 'OWNER_EMAIL is not set: existing contacts and groups need an owner';
  END IF;

  INSERT INTO "users" ("id", "name", "email", "email_verified")
  VALUES (gen_random_uuid()::text, '', owner_email, true)
  RETURNING "id" INTO owner_user_id;

  UPDATE "contacts" SET "owner_id" = owner_user_id;
  GET DIAGNOSTICS moved_contacts = ROW_COUNT;
  UPDATE "groups" SET "owner_id" = owner_user_id;
  GET DIAGNOSTICS moved_groups = ROW_COUNT;

  -- The email itself is not written to the log.
  RAISE NOTICE 'Owner user created: % contacts and % groups assigned', moved_contacts, moved_groups;
END $$;--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "login_emails_email_created_at_idx" ON "login_emails" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "login_emails_ip_created_at_idx" ON "login_emails" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_owner_created_at_idx" ON "contacts" USING btree ("owner_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "groups_owner_name_lower_idx" ON "groups" USING btree ("owner_id",lower("name"));