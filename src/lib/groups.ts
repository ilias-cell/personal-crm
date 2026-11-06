import "server-only";

import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { describeDbError, getDbErrorCode, withoutQueryData } from "@/db/errors";
import { contactGroups, contacts, groups, type Group } from "@/db/schema";

// Group names are data of the owner: they never go to the server log (see describeDbError).

const SAVE_FAILED_MESSAGE =
  "Не удалось сохранить. Проверьте, что база данных запущена, и попробуйте ещё раз.";
export const GROUP_NOT_FOUND_MESSAGE = "Этой группы уже нет. Обновите страницу.";
export const CONTACT_NOT_FOUND_MESSAGE =
  "Этот контакт не найден. Вернитесь к списку и откройте его заново.";

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

export type GroupSummary = Pick<Group, "id" | "name">;
export type GroupWithCount = GroupSummary & { contactCount: number };

export type GroupResult = { ok: true } | { ok: false; error: string };
export type GroupSavedResult = { ok: true; group: GroupSummary } | { ok: false; error: string };

function alreadyExistsMessage(name: string): string {
  return `Группа «${name}» уже есть`;
}

// Alphabetical, without regard to letter case; the id keeps the order stable for equal names.
const alphabetical = [asc(sql`lower(${groups.name})`), asc(groups.id)];

export async function listGroups(): Promise<GroupSummary[]> {
  return withoutQueryData(
    db
      .select({ id: groups.id, name: groups.name })
      .from(groups)
      .orderBy(...alphabetical),
  );
}

export async function listGroupsWithCounts(): Promise<GroupWithCount[]> {
  return withoutQueryData(
    db
      .select({ id: groups.id, name: groups.name, contactCount: count(contactGroups.contactId) })
      .from(groups)
      .leftJoin(contactGroups, eq(contactGroups.groupId, groups.id))
      .groupBy(groups.id)
      .orderBy(...alphabetical),
  );
}

// Wrapped in React.cache: the row of labels and the list of the home page share one query per request.
export const getGroup = cache(async (id: number): Promise<GroupSummary | null> => {
  const [group] = await withoutQueryData(
    db.select({ id: groups.id, name: groups.name }).from(groups).where(eq(groups.id, id)).limit(1),
  );
  return group ?? null;
});

// The groups of one person, alphabetically.
export async function listContactGroups(contactId: number): Promise<GroupSummary[]> {
  return withoutQueryData(
    db
      .select({ id: groups.id, name: groups.name })
      .from(contactGroups)
      .innerJoin(groups, eq(groups.id, contactGroups.groupId))
      .where(eq(contactGroups.contactId, contactId))
      .orderBy(...alphabetical),
  );
}

// The groups of every person on a page, in one query. People without groups are not in the map.
export async function listGroupsOfContacts(
  contactIds: number[],
): Promise<Map<number, GroupSummary[]>> {
  const byContact = new Map<number, GroupSummary[]>();
  if (contactIds.length === 0) return byContact;

  const rows = await withoutQueryData(
    db
      .select({ contactId: contactGroups.contactId, id: groups.id, name: groups.name })
      .from(contactGroups)
      .innerJoin(groups, eq(groups.id, contactGroups.groupId))
      .where(inArray(contactGroups.contactId, contactIds))
      .orderBy(...alphabetical),
  );
  for (const { contactId, id, name } of rows) {
    const list = byContact.get(contactId) ?? [];
    list.push({ id, name });
    byContact.set(contactId, list);
  }
  return byContact;
}

// The name that is already taken by a group, as it was written when the group was created.
async function findGroupByName(name: string): Promise<GroupSummary | null> {
  const [group] = await db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .where(sql`lower(${groups.name}) = lower(${name})`)
    .limit(1);
  return group ?? null;
}

// The name must already be checked (trimmed, 1-40 characters): see groupNameSchema.
// The database decides whether the name is taken, so two tabs creating the same group at once cannot both win.
export async function createGroup(name: string): Promise<GroupSavedResult> {
  try {
    const [created] = await db
      .insert(groups)
      .values({ name })
      .onConflictDoNothing()
      .returning({ id: groups.id, name: groups.name });
    if (created) return { ok: true, group: created };

    const existing = await findGroupByName(name);
    return { ok: false, error: alreadyExistsMessage(existing?.name ?? name) };
  } catch (error) {
    console.error("Failed to create group", describeDbError(error));
    return { ok: false, error: SAVE_FAILED_MESSAGE };
  }
}

// Renaming to the same name in other letter case is the same row for the unique index, so it is allowed.
export async function renameGroup(id: number, name: string): Promise<GroupResult> {
  try {
    const [renamed] = await db
      .update(groups)
      .set({ name })
      .where(eq(groups.id, id))
      .returning({ id: groups.id });
    return renamed ? { ok: true } : { ok: false, error: GROUP_NOT_FOUND_MESSAGE };
  } catch (error) {
    if (getDbErrorCode(error) === UNIQUE_VIOLATION) {
      const existing = await findGroupByName(name);
      return { ok: false, error: alreadyExistsMessage(existing?.name ?? name) };
    }
    console.error("Failed to rename group", describeDbError(error));
    return { ok: false, error: SAVE_FAILED_MESSAGE };
  }
}

// The membership rows go with the group (ON DELETE CASCADE); the people stay.
export async function deleteGroup(id: number): Promise<GroupResult> {
  try {
    const [deleted] = await db.delete(groups).where(eq(groups.id, id)).returning({ id: groups.id });
    return deleted ? { ok: true } : { ok: false, error: GROUP_NOT_FOUND_MESSAGE };
  } catch (error) {
    console.error("Failed to delete group", describeDbError(error));
    return {
      ok: false,
      error: "Не удалось удалить. Проверьте, что база данных запущена, и попробуйте ещё раз.",
    };
  }
}

// A foreign key failed while adding a membership: the contact or the group was deleted in another tab.
async function missingParentMessage(contactId: number): Promise<string> {
  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  return contact ? GROUP_NOT_FOUND_MESSAGE : CONTACT_NOT_FOUND_MESSAGE;
}

// Adding a person to a group they are already in changes nothing.
export async function addContactToGroup(contactId: number, groupId: number): Promise<GroupResult> {
  try {
    await db.insert(contactGroups).values({ contactId, groupId }).onConflictDoNothing();
    return { ok: true };
  } catch (error) {
    if (getDbErrorCode(error) === FOREIGN_KEY_VIOLATION) {
      return { ok: false, error: await missingParentMessage(contactId) };
    }
    console.error("Failed to add contact to group", describeDbError(error));
    return { ok: false, error: SAVE_FAILED_MESSAGE };
  }
}

// The name must already be checked (see groupNameSchema). One transaction: create the group if there is none
// of that name, find it, put the person in. If the contact is gone, the group is not created either.
export async function addContactToGroupByName(
  contactId: number,
  name: string,
): Promise<GroupSavedResult> {
  try {
    return await db.transaction(async (tx) => {
      await tx.insert(groups).values({ name }).onConflictDoNothing();
      const [group] = await tx
        .select({ id: groups.id, name: groups.name })
        .from(groups)
        .where(sql`lower(${groups.name}) = lower(${name})`)
        .limit(1);
      if (!group) return { ok: false as const, error: GROUP_NOT_FOUND_MESSAGE };

      await tx.insert(contactGroups).values({ contactId, groupId: group.id }).onConflictDoNothing();
      return { ok: true as const, group };
    });
  } catch (error) {
    if (getDbErrorCode(error) === FOREIGN_KEY_VIOLATION) {
      return { ok: false, error: await missingParentMessage(contactId) };
    }
    console.error("Failed to add contact to group by name", describeDbError(error));
    return { ok: false, error: SAVE_FAILED_MESSAGE };
  }
}

// Removing someone who is not in the group is not an error. The group stays, even if nobody is left in it.
export async function removeContactFromGroup(
  contactId: number,
  groupId: number,
): Promise<GroupResult> {
  try {
    await db
      .delete(contactGroups)
      .where(and(eq(contactGroups.contactId, contactId), eq(contactGroups.groupId, groupId)));
    return { ok: true };
  } catch (error) {
    console.error("Failed to remove contact from group", describeDbError(error));
    return { ok: false, error: SAVE_FAILED_MESSAGE };
  }
}
