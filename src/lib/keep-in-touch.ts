import "server-only";

import { asc, count, desc, gte, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { contacts, notes, type Contact, type TouchFrequency } from "@/db/schema";
import { OWNER_TIME_ZONE } from "@/lib/format";

export type OverdueContact = Pick<Contact, "id" | "name"> & {
  touchFrequency: TouchFrequency;
  lastNoteAt: Date | null;
  // 0: the period ends today.
  overdueDays: number;
};

// Days are counted on the owner's calendar. The app server runs in UTC, so "today" and the day of a note
// come from the database in this time zone, never from the server clock.
// A constant, so it is safe to inline; a bound parameter would leave PostgreSQL to guess its type.
const timeZone = sql.raw(`'${OWNER_TIME_ZONE}'`);

const lastNoteAt = sql<Date | null>`(select max(${notes.createdAt}) from ${notes} where ${notes.contactId} = ${contacts.id})`;

// Month, quarter and year are calendar ones: PostgreSQL moves 31 January + 1 month to the last day of February.
const period = sql`case ${contacts.touchFrequency}
  when 'week' then interval '7 days'
  when 'month' then interval '1 month'
  when 'quarter' then interval '3 months'
  when 'year' then interval '1 year'
end`;

// The period runs from the last note or from touch_restarted_at, whichever is later (greatest() skips NULLs).
const startDay = sql`(greatest(${lastNoteAt}, ${contacts.touchRestartedAt}) at time zone ${timeZone})::date`;
const dueDay = sql`(${startDay} + ${period})::date`;
const today = sql`(now() at time zone ${timeZone})::date`;

// Every contact with a frequency, with how many days past its due day it is (negative: not due yet).
const trackedContacts = db
  .select({
    id: contacts.id,
    name: contacts.name,
    touchFrequency: sql<TouchFrequency>`${contacts.touchFrequency}`.as("touch_frequency"),
    // Wrapped once more on purpose: in a one-table select Drizzle drops table names from the columns at the top
    // level of a field, and the bare "id" inside the subquery would then mean notes.id.
    // mapWith turns the database text into a Date, as it does for the notes.created_at column itself.
    lastNoteAt: sql<Date | null>`${lastNoteAt}`.mapWith(notes.createdAt).as("last_note_at"),
    overdueDays: sql<number>`${today} - ${dueDay}`.mapWith(Number).as("overdue_days"),
  })
  .from(contacts)
  .where(isNotNull(contacts.touchFrequency))
  .as("tracked_contacts");

// The person's period ended today or earlier. The longest overdue go first, equal ones by name.
export async function listOverdueContacts(): Promise<OverdueContact[]> {
  return db
    .select()
    .from(trackedContacts)
    .where(gte(trackedContacts.overdueDays, 0))
    .orderBy(desc(trackedContacts.overdueDays), asc(trackedContacts.name), asc(trackedContacts.id));
}

export async function countOverdueContacts(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(trackedContacts).where(gte(trackedContacts.overdueDays, 0));
  return row.value;
}

// Tells the two empty states of "Пора связаться" apart: nobody is overdue, or nobody has a frequency at all.
export async function hasAnyTouchFrequency(): Promise<boolean> {
  const [row] = await db.select({ value: count() }).from(contacts).where(isNotNull(contacts.touchFrequency));
  return row.value > 0;
}
