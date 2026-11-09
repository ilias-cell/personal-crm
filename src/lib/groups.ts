import "server-only";

import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { describeDbError, getDbErrorCode, withoutQueryData } from "@/db/errors";
import { contactGroups, contacts, groups, type Group } from "@/db/schema";

// Group names are data of the owner: they never go to the server log (see describeDbError).
// Every function takes the id of the logged-in user first and works only with their groups and contacts.
// A group or contact of someone else is treated as one that does not exist.

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

export async function listGroups(ownerId: string): Promise<GroupSummary[]> {
  return withoutQueryData(
    db
      .select({ id: groups.id, name: groups.name })
      .from(groups)
      .where(eq(groups.ownerId, ownerId))
      .orderBy(...alphabetical),
  );
}

// The people of an own group are all own too: a membership is never made across owners (see addContactToGroup).
export async function listGroupsWithCounts(ownerId: string): Promise<GroupWithCount[]> {
  return withoutQueryData(
    db
      .select({ id: groups.id, name: groups.name, contactCount: count(contactGroups.contactId) })
      .from(groups)
      .leftJoin(contactGroups, eq(contactGroups.groupId, groups.id))
      .where(eq(groups.ownerId, ownerId))
      .groupBy(groups.id)
      .orderBy(...alphabetical),
  );
}

// Wrapped in React.cache: the row of labels and the list of the home page share one query per request.
export const getGroup = cache(async (ownerId: string, id: number): Promise<GroupSummary | null> => {
  const [group] = await withoutQueryData(
    db
      .select({ id: groups.id, name: groups.name })
      .from(groups)
      .where(and(eq(groups.id, id), eq(groups.ownerId, ownerId)))
      .limit(1),
  );
  return group ?? null;
});

// The groups of one person, alphabetically.
export async function listContactGroups(
  ownerId: string,
  contactId: number,
): Promise<GroupSummary[]> {
  return withoutQueryData(
    db
      .select({ id: groups.id, name: groups.name })
      .from(contactGroups)
      .innerJoin(groups, eq(groups.id, contactGroups.groupId))
      .innerJoin(contacts, eq(contacts.id, contactGroups.contactId))
      .where(
        and(
          eq(contactGroups.contactId, contactId),
          eq(groups.ownerId, ownerId),
          eq(contacts.ownerId, ownerId),
        ),
      )
      .orderBy(...alphabetical),
  );
}

// The groups of every person on a page, in one query. People without groups are not in the map.
export async function listGroupsOfContacts(
  ownerId: string,
  contactIds: number[],
): Promise<Map<number, GroupSummary[]>> {
  const byContact = new Map<number, GroupSummary[]>();
  if (contactIds.length === 0) return byContact;

  const rows = await withoutQueryData(
    db
      .select({ contactId: contactGroups.contactId, id: groups.id, name: groups.name })
      .from(contactGroups)
      .innerJoin(groups, eq(groups.id, contactGroups.groupId))
      .innerJoin(contacts, eq(contacts.id, contactGroups.contactId))
      .where(
        and(
          inArray(contactGroups.contactId, contactIds),
          eq(groups.ownerId, ownerId),
          eq(contacts.ownerId, ownerId),
        ),
      )
      .orderBy(...alphabetical),
  );
  for (const { contactId, id, name } of rows) {
    const list = byContact.get(contactId) ?? [];
    list.push({ id, name });
    byContact.set(contactId, list);
  }
  return byContact;
}

// The name that is already taken by a group of the owner, as it was written when the group was created.
async function findGroupByName(ownerId: string, name: string): Promise<GroupSummary | null> {
  const [group] = await db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .where(and(eq(groups.ownerId, ownerId), sql`lower(${groups.name}) = lower(${name})`))
    .limit(1);
  return group ?? null;
}

// The name must already be checked (trimmed, 1-40 characters): see groupNameSchema.
// The database decides whether the name is taken (by the same owner: other users may have the same name),
// so two tabs creating the same group at once cannot both win.
export async function createGroup(ownerId: string, name: string): Promise<GroupSavedResult> {
  try {
    const [created] = await db
      .insert(groups)
      .values({ ownerId, name })
      .onConflictDoNothing()
      .returning({ id: groups.id, name: groups.name });
    if (created) return { ok: true, group: created };

    const existing = await findGroupByName(ownerId, name);
    return { ok: false, error: alreadyExistsMessage(existing?.name ?? name) };
  } catch (error) {
    console.error("Failed to create group", describeDbError(error));
    return { ok: false, error: SAVE_FAILED_MESSAGE };
  }
}

// Renaming to the same name in other letter case is the same row for the unique index, so it is allowed.
export async function renameGroup(ownerId: string, id: number, name: string): Promise<GroupResult> {
  try {
    const [renamed] = await db
      .update(groups)
      .set({ name })
      .where(and(eq(groups.id, id), eq(groups.ownerId, ownerId)))
      .returning({ id: groups.id });
    return renamed ? { ok: true } : { ok: false, error: GROUP_NOT_FOUND_MESSAGE };
  } catch (error) {
    if (getDbErrorCode(error) === UNIQUE_VIOLATION) {
      const existing = await findGroupByName(ownerId, name);
      return { ok: false, error: alreadyExistsMessage(existing?.name ?? name) };
    }
    console.error("Failed to rename group", describeDbError(error));
    return { ok: false, error: SAVE_FAILED_MESSAGE };
  }
}

// The membership rows go with the group (ON DELETE CASCADE); the people stay.
export async function deleteGroup(ownerId: string, id: number): Promise<GroupResult> {
  try {
    const [deleted] = await db
      .delete(groups)
      .where(and(eq(groups.id, id), eq(groups.ownerId, ownerId)))
      .returning({ id: groups.id });
    return deleted ? { ok: true } : { ok: false, error: GROUP_NOT_FOUND_MESSAGE };
  } catch (error) {
    console.error("Failed to delete group", describeDbError(error));
    return {
      ok: false,
      error: "Не удалось удалить. Проверьте, что база данных запущена, и попробуйте ещё раз.",
    };
  }
}

// Says which of the two is missing for this owner: the contact first, then the group.
// A contact or group of someone else counts as missing, so the message never hints that it exists.
async function missingParentMessage(
  ownerId: string,
  contactId: number,
  groupId: number | null,
): Promise<string | null> {
  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.ownerId, ownerId)))
    .limit(1);
  if (!contact) return CONTACT_NOT_FOUND_MESSAGE;
  if (groupId === null) return null;

  const [group] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.ownerId, ownerId)))
    .limit(1);
  return group ? null : GROUP_NOT_FOUND_MESSAGE;
}

// Both the contact and the group must be the owner's: the pair is checked before anything is written,
// so a membership is never made across owners. Adding a person to a group they are already in changes nothing.
export async function addContactToGroup(
  ownerId: string,
  contactId: number,
  groupId: number,
): Promise<GroupResult> {
  try {
    const missing = await missingParentMessage(ownerId, contactId, groupId);
    if (missing) return { ok: false, error: missing };

    await db.insert(contactGroups).values({ contactId, groupId }).onConflictDoNothing();
    return { ok: true };
  } catch (error) {
    // Deleted in another tab between the check and the write.
    if (getDbErrorCode(error) === FOREIGN_KEY_VIOLATION) {
      return {
        ok: false,
        error: (await missingParentMessage(ownerId, contactId, groupId)) ?? GROUP_NOT_FOUND_MESSAGE,
      };
    }
    console.error("Failed to add contact to group", describeDbError(error));
    return { ok: false, error: SAVE_FAILED_MESSAGE };
  }
}

// The name must already be checked (see groupNameSchema). One transaction: check that the contact is the owner's
// (otherwise no group is created), create the owner's group if there is none of that name, find it, put the person in.
// A group of another user with the same name is not touched: the owner gets a group of their own.
export async function addContactToGroupByName(
  ownerId: string,
  contactId: number,
  name: string,
): Promise<GroupSavedResult> {
  try {
    return await db.transaction(async (tx) => {
      const [contact] = await tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.id, contactId), eq(contacts.ownerId, ownerId)))
        .limit(1);
      if (!contact) return { ok: false as const, error: CONTACT_NOT_FOUND_MESSAGE };

      await tx.insert(groups).values({ ownerId, name }).onConflictDoNothing();
      const [group] = await tx
        .select({ id: groups.id, name: groups.name })
        .from(groups)
        .where(and(eq(groups.ownerId, ownerId), sql`lower(${groups.name}) = lower(${name})`))
        .limit(1);
      if (!group) return { ok: false as const, error: GROUP_NOT_FOUND_MESSAGE };

      await tx.insert(contactGroups).values({ contactId, groupId: group.id }).onConflictDoNothing();
      return { ok: true as const, group };
    });
  } catch (error) {
    // Deleted in another tab between the check and the write.
    if (getDbErrorCode(error) === FOREIGN_KEY_VIOLATION) {
      return {
        ok: false,
        error: (await missingParentMessage(ownerId, contactId, null)) ?? GROUP_NOT_FOUND_MESSAGE,
      };
    }
    console.error("Failed to add contact to group by name", describeDbError(error));
    return { ok: false, error: SAVE_FAILED_MESSAGE };
  }
}

// Removing someone who is not in the group is not an error. The group stays, even if nobody is left in it.
// The contact and the group must be the owner's, otherwise nothing is removed.
export async function removeContactFromGroup(
  ownerId: string,
  contactId: number,
  groupId: number,
): Promise<GroupResult> {
  try {
    const missing = await missingParentMessage(ownerId, contactId, groupId);
    if (missing) return { ok: false, error: missing };

    await db
      .delete(contactGroups)
      .where(and(eq(contactGroups.contactId, contactId), eq(contactGroups.groupId, groupId)));
    return { ok: true };
  } catch (error) {
    console.error("Failed to remove contact from group", describeDbError(error));
    return { ok: false, error: SAVE_FAILED_MESSAGE };
  }
}
