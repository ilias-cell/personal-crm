// Plain inserts for test setup. They bypass the app code on purpose, so a test only exercises what it checks.

import { db } from "@/db";
import { contactGroups, contacts, groups, type Contact, type Group } from "@/db/schema";

export async function insertContact(name: string, values: Partial<typeof contacts.$inferInsert> = {}): Promise<Contact> {
  const [contact] = await db.insert(contacts).values({ name, ...values }).returning();
  return contact;
}

// Contacts created one by one, so the first one is the oldest.
export async function insertContacts(names: string[]): Promise<Contact[]> {
  const created: Contact[] = [];
  for (const name of names) {
    created.push(await insertContact(name));
  }
  return created;
}

// Many contacts in one statement (they share a creation time, so the newest is the one with the biggest id).
export async function insertManyContacts(names: string[]): Promise<Contact[]> {
  return db.insert(contacts).values(names.map((name) => ({ name }))).returning();
}

export async function insertGroup(name: string): Promise<Group> {
  const [group] = await db.insert(groups).values({ name }).returning();
  return group;
}

export async function addToGroup(contactId: number, groupId: number): Promise<void> {
  await db.insert(contactGroups).values({ contactId, groupId });
}

// A group with this many new people in it.
export async function insertGroupWithPeople(name: string, count: number): Promise<{ group: Group; people: Contact[] }> {
  const group = await insertGroup(name);
  const people = await insertManyContacts(Array.from({ length: count }, (_, index) => `${name} ${index + 1}`));
  await db.insert(contactGroups).values(people.map((person) => ({ contactId: person.id, groupId: group.id })));
  return { group, people };
}
