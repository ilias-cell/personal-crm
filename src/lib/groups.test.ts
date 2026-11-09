import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { contactGroups, contacts, notes, type User } from "@/db/schema";
import {
  addContactToGroup,
  addContactToGroupByName,
  createGroup,
  deleteGroup,
  getGroup,
  listContactGroups,
  listGroups,
  listGroupsOfContacts,
  listGroupsWithCounts,
  removeContactFromGroup,
  renameGroup,
} from "@/lib/groups";
import {
  addToGroup,
  insertContact,
  insertGroup,
  insertGroupWithPeople,
  insertUser,
} from "@/test/factories";

// The user whose data a test works with; every test starts with its own, because the tables are emptied.
let owner: User;
beforeEach(async () => {
  owner = await insertUser("owner@example.com");
});

describe("groups list", () => {
  it("has no groups on a fresh database", async () => {
    expect(await listGroups(owner.id)).toEqual([]);
    expect(await listGroupsWithCounts(owner.id)).toEqual([]);
  });

  it("lists groups alphabetically, ignoring letter case", async () => {
    await createGroup(owner.id, "Теннис");
    await createGroup(owner.id, "аналитики");
    await createGroup(owner.id, "Семья");

    expect((await listGroups(owner.id)).map((group) => group.name)).toEqual([
      "аналитики",
      "Семья",
      "Теннис",
    ]);
    expect((await listGroupsWithCounts(owner.id)).map((group) => group.name)).toEqual([
      "аналитики",
      "Семья",
      "Теннис",
    ]);
  });

  it("puts «ё» in its place among the letters", async () => {
    await createGroup(owner.id, "Ежи");
    await createGroup(owner.id, "Ёлки");
    await createGroup(owner.id, "Жуки");

    expect((await listGroups(owner.id)).map((group) => group.name)).toEqual([
      "Ежи",
      "Ёлки",
      "Жуки",
    ]);
  });

  it("shows every group with the number of its people", async () => {
    await insertGroup(owner.id, "Аналитики");
    await insertGroupWithPeople(owner.id, "Семья", 1);
    await insertGroupWithPeople(owner.id, "Теннис", 12);

    const shown = (await listGroupsWithCounts(owner.id)).map(({ name, contactCount }) => [
      name,
      contactCount,
    ]);
    expect(shown).toEqual([
      ["Аналитики", 0],
      ["Семья", 1],
      ["Теннис", 12],
    ]);
  });

  it("counts one fewer person after a contact of the group is deleted", async () => {
    const { people } = await insertGroupWithPeople(owner.id, "Теннис", 12);

    await db.delete(contacts).where(eq(contacts.id, people[0].id));

    expect((await listGroupsWithCounts(owner.id)).map(({ contactCount }) => contactCount)).toEqual([
      11,
    ]);
  });
});

describe("createGroup", () => {
  it("creates a group that is then listed with nobody in it", async () => {
    const result = await createGroup(owner.id, "Теннис");

    expect(result).toMatchObject({ ok: true, group: { name: "Теннис" } });
    expect(await listGroupsWithCounts(owner.id)).toMatchObject([
      { name: "Теннис", contactCount: 0 },
    ]);
  });

  it("refuses a name that differs from an existing group only in letter case", async () => {
    await createGroup(owner.id, "Семья");

    const result = await createGroup(owner.id, "семья");

    expect(result).toEqual({ ok: false, error: "Группа «Семья» уже есть" });
    expect((await listGroups(owner.id)).map((group) => group.name)).toEqual(["Семья"]);
  });

  it("ignores letter case for «ё» too", async () => {
    await createGroup(owner.id, "Ёлка");

    expect(await createGroup(owner.id, "ёлка")).toEqual({
      ok: false,
      error: "Группа «Ёлка» уже есть",
    });
  });
});

describe("getGroup", () => {
  it("returns the group by its number", async () => {
    const created = await insertGroup(owner.id, "Теннис");

    expect(await getGroup(owner.id, created.id)).toMatchObject({ id: created.id, name: "Теннис" });
  });

  it("returns nothing for a group that does not exist", async () => {
    expect(await getGroup(owner.id, 999)).toBeNull();
  });
});

describe("renameGroup", () => {
  it("renames a group and keeps its people", async () => {
    const { group } = await insertGroupWithPeople(owner.id, "Теннис", 12);

    const result = await renameGroup(owner.id, group.id, "Теннис по средам");

    expect(result).toEqual({ ok: true });
    expect(await listGroupsWithCounts(owner.id)).toMatchObject([
      { name: "Теннис по средам", contactCount: 12 },
    ]);
  });

  it("refuses a name that another group already has, whatever the letter case", async () => {
    await insertGroup(owner.id, "Семья");
    const tennis = await insertGroup(owner.id, "Теннис");

    const result = await renameGroup(owner.id, tennis.id, "семья");

    expect(result).toEqual({ ok: false, error: "Группа «Семья» уже есть" });
    expect((await getGroup(owner.id, tennis.id))?.name).toBe("Теннис");
  });

  it("allows changing only the letter case of the name", async () => {
    const tennis = await insertGroup(owner.id, "теннис");

    const result = await renameGroup(owner.id, tennis.id, "Теннис");

    expect(result).toEqual({ ok: true });
    expect((await getGroup(owner.id, tennis.id))?.name).toBe("Теннис");
  });

  it("keeps the number of the group, so a saved address leads to the renamed group", async () => {
    const tennis = await insertGroup(owner.id, "Теннис");

    await renameGroup(owner.id, tennis.id, "Теннис по средам");

    expect(await getGroup(owner.id, tennis.id)).toEqual({
      id: tennis.id,
      name: "Теннис по средам",
    });
  });

  it("says the group is gone when it was deleted in another tab", async () => {
    const result = await renameGroup(owner.id, 999, "Теннис");

    expect(result).toEqual({ ok: false, error: "Этой группы уже нет. Обновите страницу." });
  });
});

describe("deleteGroup", () => {
  it("removes the group and keeps its people with their notes and other groups", async () => {
    const anna = await insertContact(owner.id, "Анна");
    await db.insert(notes).values({ contactId: anna.id, body: "Встретились на корте" });
    const tennis = await insertGroup(owner.id, "Теннис");
    const family = await insertGroup(owner.id, "Семья");
    await addToGroup(anna.id, tennis.id);
    await addToGroup(anna.id, family.id);

    const result = await deleteGroup(owner.id, tennis.id);

    expect(result).toEqual({ ok: true });
    expect((await listGroups(owner.id)).map((group) => group.name)).toEqual(["Семья"]);
    expect(await db.select().from(contacts)).toHaveLength(1);
    expect(await db.select({ body: notes.body }).from(notes)).toEqual([
      { body: "Встретились на корте" },
    ]);
    expect(await db.select().from(contactGroups)).toEqual([
      { contactId: anna.id, groupId: family.id },
    ]);
  });

  it("says the group is gone when it was already deleted in another tab", async () => {
    const tennis = await insertGroup(owner.id, "Теннис");
    await deleteGroup(owner.id, tennis.id);

    expect(await deleteGroup(owner.id, tennis.id)).toEqual({
      ok: false,
      error: "Этой группы уже нет. Обновите страницу.",
    });
  });
});

async function groupNamesOf(contactId: number): Promise<string[]> {
  return (await listContactGroups(owner.id, contactId)).map((group) => group.name);
}

async function countsByName(): Promise<Record<string, number>> {
  const groupsWithCounts = await listGroupsWithCounts(owner.id);
  return Object.fromEntries(groupsWithCounts.map(({ name, contactCount }) => [name, contactCount]));
}

describe("groups of a person", () => {
  it("puts a person in several groups", async () => {
    const anna = await insertContact(owner.id, "Анна");
    const family = await insertGroup(owner.id, "Семья");
    const tennis = await insertGroup(owner.id, "Теннис");

    expect(await addContactToGroup(owner.id, anna.id, family.id)).toEqual({ ok: true });
    expect(await addContactToGroup(owner.id, anna.id, tennis.id)).toEqual({ ok: true });

    expect(await groupNamesOf(anna.id)).toEqual(["Семья", "Теннис"]);
    expect(await countsByName()).toEqual({ Семья: 1, Теннис: 1 });
  });

  it("lists the groups of a person alphabetically, ignoring letter case", async () => {
    const anna = await insertContact(owner.id, "Анна");
    for (const name of ["Теннис", "аналитики", "Семья"]) {
      await addToGroup(anna.id, (await insertGroup(owner.id, name)).id);
    }

    expect(await groupNamesOf(anna.id)).toEqual(["аналитики", "Семья", "Теннис"]);
  });

  it("lists no groups for a person who is in none", async () => {
    const boris = await insertContact(owner.id, "Борис");
    await insertGroup(owner.id, "Семья");

    expect(await listContactGroups(owner.id, boris.id)).toEqual([]);
  });

  it("shows the same groups on every read, as in another browser", async () => {
    const anna = await insertContact(owner.id, "Анна");
    const tennis = await insertGroup(owner.id, "Теннис");
    await addContactToGroup(owner.id, anna.id, tennis.id);

    expect(await groupNamesOf(anna.id)).toEqual(["Теннис"]);
    expect(await groupNamesOf(anna.id)).toEqual(["Теннис"]);
    expect(await countsByName()).toEqual({ Теннис: 1 });
  });

  it("leaves a person in a group once when added twice", async () => {
    const anna = await insertContact(owner.id, "Анна");
    const tennis = await insertGroup(owner.id, "Теннис");

    await addContactToGroup(owner.id, anna.id, tennis.id);
    expect(await addContactToGroup(owner.id, anna.id, tennis.id)).toEqual({ ok: true });

    expect(await groupNamesOf(anna.id)).toEqual(["Теннис"]);
  });

  it("removes a person from one group only", async () => {
    const anna = await insertContact(owner.id, "Анна");
    const family = await insertGroup(owner.id, "Семья");
    const tennis = await insertGroup(owner.id, "Теннис");
    await addToGroup(anna.id, family.id);
    await addToGroup(anna.id, tennis.id);

    expect(await removeContactFromGroup(owner.id, anna.id, tennis.id)).toEqual({ ok: true });

    expect(await groupNamesOf(anna.id)).toEqual(["Семья"]);
    expect(await countsByName()).toEqual({ Семья: 1, Теннис: 0 });
  });

  it("keeps the group when its last person is removed", async () => {
    const anna = await insertContact(owner.id, "Анна");
    const yoga = await insertGroup(owner.id, "Йога");
    await addToGroup(anna.id, yoga.id);

    await removeContactFromGroup(owner.id, anna.id, yoga.id);

    expect(await countsByName()).toEqual({ Йога: 0 });
  });

  it("does not mind removing a person from a group they are not in", async () => {
    const anna = await insertContact(owner.id, "Анна");
    const tennis = await insertGroup(owner.id, "Теннис");

    expect(await removeContactFromGroup(owner.id, anna.id, tennis.id)).toEqual({ ok: true });
  });

  it("says the contact is gone when it was deleted in another tab", async () => {
    const tennis = await insertGroup(owner.id, "Теннис");

    expect(await addContactToGroup(owner.id, 999, tennis.id)).toEqual({
      ok: false,
      error: "Этот контакт не найден. Вернитесь к списку и откройте его заново.",
    });
  });

  it("says the group is gone when it was deleted in another tab", async () => {
    const anna = await insertContact(owner.id, "Анна");

    expect(await addContactToGroup(owner.id, anna.id, 999)).toEqual({
      ok: false,
      error: "Этой группы уже нет. Обновите страницу.",
    });
  });
});

describe("addContactToGroupByName", () => {
  it("creates a new group and puts the person in it", async () => {
    const anna = await insertContact(owner.id, "Анна");

    const result = await addContactToGroupByName(owner.id, anna.id, "Йога");

    expect(result).toMatchObject({ ok: true, group: { name: "Йога" } });
    expect(await groupNamesOf(anna.id)).toEqual(["Йога"]);
    expect(await countsByName()).toEqual({ Йога: 1 });
  });

  it("puts the person in the existing group when the name differs only in letter case", async () => {
    const anna = await insertContact(owner.id, "Анна");
    await insertGroup(owner.id, "Семья");

    const result = await addContactToGroupByName(owner.id, anna.id, "семья");

    expect(result).toMatchObject({ ok: true, group: { name: "Семья" } });
    expect(await groupNamesOf(anna.id)).toEqual(["Семья"]);
    expect((await listGroups(owner.id)).map((group) => group.name)).toEqual(["Семья"]);
  });

  it("changes nothing for a person who is already in the group", async () => {
    const anna = await insertContact(owner.id, "Анна");
    const tennis = await insertGroup(owner.id, "Теннис");
    await addToGroup(anna.id, tennis.id);

    const result = await addContactToGroupByName(owner.id, anna.id, "теннис");

    expect(result).toMatchObject({ ok: true, group: { name: "Теннис" } });
    expect(await groupNamesOf(anna.id)).toEqual(["Теннис"]);
    expect((await listGroups(owner.id)).map((group) => group.name)).toEqual(["Теннис"]);
  });

  it("creates no group when the contact was deleted in another tab", async () => {
    const result = await addContactToGroupByName(owner.id, 999, "Йога");

    expect(result).toEqual({
      ok: false,
      error: "Этот контакт не найден. Вернитесь к списку и откройте его заново.",
    });
    expect(await listGroups(owner.id)).toEqual([]);
  });
});

describe("listGroupsOfContacts", () => {
  it("gives the groups of every person in one go, each alphabetically", async () => {
    const anna = await insertContact(owner.id, "Анна");
    const boris = await insertContact(owner.id, "Борис");
    const vera = await insertContact(owner.id, "Вера");
    const family = await insertGroup(owner.id, "Семья");
    const analysts = await insertGroup(owner.id, "аналитики");
    const tennis = await insertGroup(owner.id, "Теннис");
    await addToGroup(anna.id, tennis.id);
    await addToGroup(anna.id, family.id);
    await addToGroup(boris.id, tennis.id);
    await addToGroup(boris.id, analysts.id);

    const byContact = await listGroupsOfContacts(owner.id, [anna.id, boris.id, vera.id]);

    expect(byContact.get(anna.id)?.map((group) => group.name)).toEqual(["Семья", "Теннис"]);
    expect(byContact.get(boris.id)?.map((group) => group.name)).toEqual(["аналитики", "Теннис"]);
    expect(byContact.get(vera.id)).toBeUndefined();
  });

  it("gives nothing for no people", async () => {
    expect((await listGroupsOfContacts(owner.id, [])).size).toBe(0);
  });
});

describe("groups of other users", () => {
  it("can have the same name for two users, each group with its own people", async () => {
    const other = await insertUser("other@example.com");
    const annaFriends = await createGroup(owner.id, "Друзья");
    const borisFriends = await createGroup(other.id, "Друзья");

    expect(annaFriends.ok).toBe(true);
    expect(borisFriends.ok).toBe(true);
    expect((await listGroups(owner.id)).map((group) => group.name)).toEqual(["Друзья"]);
    expect((await listGroups(other.id)).map((group) => group.name)).toEqual(["Друзья"]);
  });

  it("still refuse a name the same user already has", async () => {
    const other = await insertUser("other@example.com");
    await createGroup(other.id, "Друзья");
    await createGroup(owner.id, "Друзья");

    expect(await createGroup(owner.id, "друзья")).toEqual({
      ok: false,
      error: "Группа «Друзья» уже есть",
    });
  });

  it("are not listed, and not counted, for someone else", async () => {
    const other = await insertUser("other@example.com");
    const family = await insertGroup(owner.id, "Семья");
    const anna = await insertContact(owner.id, "Анна");
    await addToGroup(anna.id, family.id);

    expect(await listGroups(other.id)).toEqual([]);
    expect(await listGroupsWithCounts(other.id)).toEqual([]);
    expect(await listGroupsWithCounts(owner.id)).toEqual([
      { id: family.id, name: "Семья", contactCount: 1 },
    ]);
  });

  it("do not open by id: the same as a group that does not exist", async () => {
    const other = await insertUser("other@example.com");
    const family = await insertGroup(owner.id, "Семья");

    expect(await getGroup(other.id, family.id)).toBeNull();
    expect(await getGroup(other.id, family.id)).toEqual(await getGroup(other.id, 999999));
    expect(await getGroup(owner.id, family.id)).toEqual({ id: family.id, name: "Семья" });
  });

  it("are not renamed or deleted by someone else", async () => {
    const other = await insertUser("other@example.com");
    const family = await insertGroup(owner.id, "Семья");
    const notFound = { ok: false, error: "Этой группы уже нет. Обновите страницу." };

    expect(await renameGroup(other.id, family.id, "Чужая")).toEqual(notFound);
    expect(await deleteGroup(other.id, family.id)).toEqual(notFound);
    expect((await listGroups(owner.id)).map((group) => group.name)).toEqual(["Семья"]);
  });

  it("do not show their members to someone else", async () => {
    const other = await insertUser("other@example.com");
    const family = await insertGroup(owner.id, "Семья");
    const anna = await insertContact(owner.id, "Анна");
    await addToGroup(anna.id, family.id);

    expect(await listContactGroups(other.id, anna.id)).toEqual([]);
    expect((await listGroupsOfContacts(other.id, [anna.id])).size).toBe(0);
  });
});

describe("putting people into groups across users", () => {
  const contactNotFound = {
    ok: false,
    error: "Этот контакт не найден. Вернитесь к списку и откройте его заново.",
  };
  const groupNotFound = { ok: false, error: "Этой группы уже нет. Обновите страницу." };

  it("does not put an own contact into the group of someone else", async () => {
    const other = await insertUser("other@example.com");
    const foreignGroup = await insertGroup(other.id, "Теннис");
    const mine = await insertContact(owner.id, "Анна");

    expect(await addContactToGroup(owner.id, mine.id, foreignGroup.id)).toEqual(groupNotFound);
    expect(await listContactGroups(owner.id, mine.id)).toEqual([]);
    expect(await listGroupsWithCounts(other.id)).toEqual([
      { id: foreignGroup.id, name: "Теннис", contactCount: 0 },
    ]);
  });

  it("does not put a contact of someone else into an own group", async () => {
    const other = await insertUser("other@example.com");
    const foreign = await insertContact(other.id, "Борис");
    const mineGroup = await insertGroup(owner.id, "Семья");

    expect(await addContactToGroup(owner.id, foreign.id, mineGroup.id)).toEqual(contactNotFound);
    expect(await listGroupsWithCounts(owner.id)).toEqual([
      { id: mineGroup.id, name: "Семья", contactCount: 0 },
    ]);
  });

  it("does not take a contact of someone else out of their group", async () => {
    const other = await insertUser("other@example.com");
    const foreign = await insertContact(other.id, "Борис");
    const foreignGroup = await insertGroup(other.id, "Теннис");
    await addToGroup(foreign.id, foreignGroup.id);

    expect(await removeContactFromGroup(owner.id, foreign.id, foreignGroup.id)).toEqual(
      contactNotFound,
    );
    expect((await listContactGroups(other.id, foreign.id)).map((group) => group.name)).toEqual([
      "Теннис",
    ]);
  });

  it("does not take an own contact out of a group of someone else", async () => {
    const other = await insertUser("other@example.com");
    const foreignGroup = await insertGroup(other.id, "Теннис");
    const mine = await insertContact(owner.id, "Анна");

    expect(await removeContactFromGroup(owner.id, mine.id, foreignGroup.id)).toEqual(groupNotFound);
  });

  it("creates no group when the contact is someone else's, even by name", async () => {
    const other = await insertUser("other@example.com");
    const foreign = await insertContact(other.id, "Борис");

    expect(await addContactToGroupByName(owner.id, foreign.id, "Теннис")).toEqual(contactNotFound);
    expect(await listGroups(owner.id)).toEqual([]);
    expect(await listContactGroups(other.id, foreign.id)).toEqual([]);
  });

  it("creates an own group when the name is taken by someone else's group", async () => {
    const other = await insertUser("other@example.com");
    const foreignTennis = await insertGroup(other.id, "Теннис");
    const mine = await insertContact(owner.id, "Анна");

    const result = await addContactToGroupByName(owner.id, mine.id, "Теннис");

    expect(result.ok).toBe(true);
    const own = await listGroupsWithCounts(owner.id);
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({ name: "Теннис", contactCount: 1 });
    expect(own[0].id).not.toBe(foreignTennis.id);
    expect(await listGroupsWithCounts(other.id)).toEqual([
      { id: foreignTennis.id, name: "Теннис", contactCount: 0 },
    ]);
  });
});
