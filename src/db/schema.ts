import { sql } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// How often the owner wants to keep in touch with a contact.
export const touchFrequency = pgEnum("touch_frequency", ["week", "month", "quarter", "year"]);

export const contacts = pgTable(
  "contacts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
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
  (table) => [index("contacts_created_at_idx").on(table.createdAt.desc(), table.id.desc())],
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
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Two groups that differ only in letter case cannot exist, even when created from two tabs at once.
  (table) => [uniqueIndex("groups_name_lower_idx").on(sql`lower(${table.name})`)],
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

export type TouchFrequency = (typeof touchFrequency.enumValues)[number];
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type Group = typeof groups.$inferSelect;
