import { index, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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

export type TouchFrequency = (typeof touchFrequency.enumValues)[number];
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
