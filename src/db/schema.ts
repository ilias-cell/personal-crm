import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// How often the owner wants to keep in touch with a contact.
export const touchFrequency = pgEnum("touch_frequency", ["week", "month", "quarter", "year"]);

// Who uses the app. A user is created at the first login by email link; the name is never asked.
// The tables users, sessions, accounts and verifications follow the base schema of Better Auth (the login library).
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  // Not used by the app, but Better Auth requires the column. Empty for everyone.
  name: text("name").notNull(),
  // Always stored trimmed and in lower case, so "Anna@Example.com" and "anna@example.com" are one user.
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per logged-in device. Logging out deletes only the row of that device.
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Moved forward on every visit: the login lasts 30 days from the last visit.
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

// Login methods other than the email link (passwords, Google). The app has none, so the table stays empty,
// but Better Auth expects it.
export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)],
);

// Login links waiting to be opened. The identifier holds a fingerprint of the link, never the link itself;
// the value holds the email the link was sent to. A link is deleted when used.
export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

// Login emails already sent, to limit how many one email address and one internet address can ask for.
// Rows older than an hour are deleted whenever a new one is written.
export const loginEmails = pgTable(
  "login_emails",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    email: text("email").notNull(),
    // NULL when the address of the sender is unknown (locally, in tests).
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("login_emails_email_created_at_idx").on(table.email, table.createdAt),
    index("login_emails_ip_created_at_idx").on(table.ip, table.createdAt),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    // Whose contact this is. Every query filters by it. No cascade: deleting a user must never wipe contacts silently.
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    // Who this person is: role, relation, anything that helps to recall them.
    about: text("about"),
    // Where we know each other from.
    howMet: text("how_met"),
    phone: text("phone"),
    email: text("email"),
    // NULL means "not set": the contact never shows up in "Пора связаться".
    touchFrequency: touchFrequency("touch_frequency"),
    // When the keep-in-touch period was started over: the frequency was changed to another value,
    // or set on a contact without notes. The period runs from this moment or the last note, whichever is later.
    touchRestartedAt: timestamp("touch_restarted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // The order of the main list inside one owner: newest first.
  (table) => [
    index("contacts_owner_created_at_idx").on(
      table.ownerId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
  ],
);

export const notes = pgTable(
  "notes",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("notes_contact_created_at_idx").on(table.contactId, table.createdAt.desc())],
);

// Groups the owner creates to sort people into circles: family, friends, tennis.
export const groups = pgTable(
  "groups",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    // Whose group this is: every user has their own groups, and two users can both have "Друзья".
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // One owner cannot have two groups that differ only in letter case, even when created from two tabs at once.
  (table) => [
    uniqueIndex("groups_owner_name_lower_idx").on(table.ownerId, sql`lower(${table.name})`),
  ],
);

// Who is in which group. A person is in a group at most once; deleting either side removes the membership.
export const contactGroups = pgTable(
  "contact_groups",
  {
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.contactId, table.groupId] }),
    // For the people of one group and for the counts on the "Группы" page.
    index("contact_groups_group_contact_idx").on(table.groupId, table.contactId),
  ],
);

export type User = typeof users.$inferSelect;
export type TouchFrequency = (typeof touchFrequency.enumValues)[number];
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type Group = typeof groups.$inferSelect;
