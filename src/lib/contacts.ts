import "server-only";

import { and, count, desc, eq, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { withoutQueryData } from "@/db/errors";
import { contactGroups, contacts, notes, type Contact, type Note } from "@/db/schema";
import { listGroupsOfContacts, type GroupSummary } from "@/lib/groups";
import { PAGE_SIZE } from "@/lib/pagination";

export type ContactListItem = Pick<Contact, "id" | "name" | "about" | "howMet" | "phone" | "email"> & {
  // The groups of the person, alphabetically; empty if they are in none.
  groups: GroupSummary[];
};

// Search ignores letter case and treats "ё" and "е" as the same letter.
function normalizeForSearch(value: string): string {
  return value.toLowerCase().replaceAll("ё", "е");
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

// Every word of the search must occur in the name, in any order.
// Names where each word starts a name part ("анна" -> "Анна ...") go before inner matches ("Жанна ...");
// inside each group, and without a search, the newest contacts come first.
// With a group, only its people are searched; the order stays the same.
// The list and its count share this, so both always see the same contacts.
function searchContacts(search: string, groupId: number | null) {
  const terms = normalizeForSearch(search).split(/\s+/).filter(Boolean).map(escapeLikePattern);
  const normalizedName = sql`translate(lower(${contacts.name}), 'ё', 'е')`;

  const containsEveryTerm = terms.map((term) => sql`${normalizedName} like ${`%${term}%`}`);
  const startsWithEveryTerm = terms.map(
    (term) =>
      sql`(${normalizedName} like ${`${term}%`} or ${normalizedName} like ${`% ${term}%`} or ${normalizedName} like ${`%-${term}%`})`,
  );
  const relevance =
    terms.length > 0 ? [desc(sql`(${sql.join(startsWithEveryTerm, sql` and `)})`)] : [];

  const inGroup =
    groupId === null
      ? undefined
      : sql`exists (select 1 from ${contactGroups} where ${contactGroups.contactId} = ${contacts.id} and ${contactGroups.groupId} = ${groupId})`;

  return {
    where: and(...containsEveryTerm, inGroup),
    // The id makes the order unique, so pages never share or skip a contact.
    orderBy: [...relevance, desc(contacts.createdAt), desc(contacts.id)],
  };
}

// The search text is a query parameter: a failed query must not carry it into the server log.
export async function listContacts(
  search: string,
  page: number,
  groupId: number | null = null,
): Promise<ContactListItem[]> {
  const { where, orderBy } = searchContacts(search, groupId);
  const pageOfContacts = await withoutQueryData(
    db
      .select({
        id: contacts.id,
        name: contacts.name,
        about: contacts.about,
        howMet: contacts.howMet,
        phone: contacts.phone,
        email: contacts.email,
      })
      .from(contacts)
      .where(where)
      .orderBy(...orderBy)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  );
  // The groups of the whole page in one more query, not one per person.
  const groupsByContact = await listGroupsOfContacts(pageOfContacts.map((contact) => contact.id));
  return pageOfContacts.map((contact) => ({ ...contact, groups: groupsByContact.get(contact.id) ?? [] }));
}

// Without a search, all contacts; with a group, only its people.
export async function countContacts(search = "", groupId: number | null = null): Promise<number> {
  const [row] = await withoutQueryData(
    db.select({ value: count() }).from(contacts).where(searchContacts(search, groupId).where),
  );
  return row.value;
}

// Contact ids come from the URL, so anything that is not a positive integer means "no such contact".
export function parseContactId(raw: string): number | null {
  if (!/^[1-9]\d{0,8}$/.test(raw)) return null;
  return Number(raw);
}

// Wrapped in React.cache: page metadata and page body share one query per request.
export const getContact = cache(async (id: number): Promise<Contact | null> => {
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  return contact ?? null;
});

export async function countNotes(contactId: number): Promise<number> {
  const [row] = await db.select({ value: count() }).from(notes).where(eq(notes.contactId, contactId));
  return row.value;
}

export async function listNotes(contactId: number): Promise<Note[]> {
  return db
    .select()
    .from(notes)
    .where(eq(notes.contactId, contactId))
    .orderBy(desc(notes.createdAt), desc(notes.id));
}
