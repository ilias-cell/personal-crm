// Plain inserts for test setup. They bypass the app code on purpose, so a test only exercises what it checks.

import { randomUUID } from "node:crypto";

import { db } from "@/db";
import {
  contactGroups,
  contacts,
  groups,
  users,
  type Contact,
  type Group,
  type User,
} from "@/db/schema";

// A user that exists without a login: the row Better Auth would create at the first login.
// The email is stored the way the app stores it: trimmed and in lower case.
export async function insertUser(email: string): Promise<User> {
  const [user] = await db
    .insert(users)
    .values({ id: randomUUID(), name: "", email: email.trim().toLowerCase(), emailVerified: true })
    .returning();
  return user;
}

// Every contact and group belongs to an owner: the first argument is the id of a user from insertUser.
export async function insertContact(
  ownerId: string,
  name: string,
  values: Partial<typeof contacts.$inferInsert> = {},
): Promise<Contact> {
  const [contact] = await db
    .insert(contacts)
    .values({ name, ...values, ownerId })
    .returning();
  return contact;
}

// Contacts created one by one, so the first one is the oldest.
export async function insertContacts(ownerId: string, names: string[]): Promise<Contact[]> {
  const created: Contact[] = [];
  for (const name of names) {
    created.push(await insertContact(ownerId, name));
  }
  return created;
}

// Many contacts in one statement (they share a creation time, so the newest is the one with the biggest id).
export async function insertManyContacts(ownerId: string, names: string[]): Promise<Contact[]> {
  return db
    .insert(contacts)
    .values(names.map((name) => ({ name, ownerId })))
    .returning();
}

export async function insertGroup(ownerId: string, name: string): Promise<Group> {
  const [group] = await db.insert(groups).values({ name, ownerId }).returning();
  return group;
}

export async function addToGroup(contactId: number, groupId: number): Promise<void> {
  await db.insert(contactGroups).values({ contactId, groupId });
}

// A group with this many new people in it.
export async function insertGroupWithPeople(
  ownerId: string,
  name: string,
  count: number,
): Promise<{ group: Group; people: Contact[] }> {
  const group = await insertGroup(ownerId, name);
  const people = await insertManyContacts(
    ownerId,
    Array.from({ length: count }, (_, index) => `${name} ${index + 1}`),
  );
  await db
    .insert(contactGroups)
    .values(people.map((person) => ({ contactId: person.id, groupId: group.id })));
  return { group, people };
}
