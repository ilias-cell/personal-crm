import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { contactGroups, contacts, notes } from "@/db/schema";
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
import { addToGroup, insertContact, insertGroup, insertGroupWithPeople } from "@/test/factories";

describe("groups list", () => {
  it("has no groups on a fresh database", async () => {
    expect(await listGroups()).toEqual([]);
    expect(await listGroupsWithCounts()).toEqual([]);
  });

  it("lists groups alphabetically, ignoring letter case", async () => {
    await createGroup("Теннис");
    await createGroup("аналитики");
    await createGroup("Семья");

    expect((await listGroups()).map((group) => group.name)).toEqual(["аналитики", "Семья", "Теннис"]);
    expect((await listGroupsWithCounts()).map((group) => group.name)).toEqual(["аналитики", "Семья", "Теннис"]);
  });

  it("puts «ё» in its place among the letters", async () => {
    await createGroup("Ежи");
    await createGroup("Ёлки");
    await createGroup("Жуки");

    expect((await listGroups()).map((group) => group.name)).toEqual(["Ежи", "Ёлки", "Жуки"]);
  });

  it("shows every group with the number of its people", async () => {
    await insertGroup("Аналитики");
    await insertGroupWithPeople("Семья", 1);
    await insertGroupWithPeople("Теннис", 12);

    const shown = (await listGroupsWithCounts()).map(({ name, contactCount }) => [name, contactCount]);
    expect(shown).toEqual([
      ["Аналитики", 0],
      ["Семья", 1],
      ["Теннис", 12],
    ]);
  });

  it("counts one fewer person after a contact of the group is deleted", async () => {
    const { people } = await insertGroupWithPeople("Теннис", 12);

    await db.delete(contacts).where(eq(contacts.id, people[0].id));

    expect((await listGroupsWithCounts()).map(({ contactCount }) => contactCount)).toEqual([11]);
  });
});

describe("createGroup", () => {
  it("creates a group that is then listed with nobody in it", async () => {
    const result = await createGroup("Теннис");

    expect(result).toMatchObject({ ok: true, group: { name: "Теннис" } });
    expect(await listGroupsWithCounts()).toMatchObject([{ name: "Теннис", contactCount: 0 }]);
  });

  it("refuses a name that differs from an existing group only in letter case", async () => {
    await createGroup("Семья");

    const result = await createGroup("семья");

    expect(result).toEqual({ ok: false, error: "Группа «Семья» уже есть" });
    expect((await listGroups()).map((group) => group.name)).toEqual(["Семья"]);
  });

  it("ignores letter case for «ё» too", async () => {
    await createGroup("Ёлка");

    expect(await createGroup("ёлка")).toEqual({ ok: false, error: "Группа «Ёлка» уже есть" });
  });
});

describe("getGroup", () => {
  it("returns the group by its number", async () => {
    const created = await insertGroup("Теннис");

    expect(await getGroup(created.id)).toMatchObject({ id: created.id, name: "Теннис" });
  });

  it("returns nothing for a group that does not exist", async () => {
    expect(await getGroup(999)).toBeNull();
  });
});

describe("renameGroup", () => {
  it("renames a group and keeps its people", async () => {
    const { group } = await insertGroupWithPeople("Теннис", 12);

    const result = await renameGroup(group.id, "Теннис по средам");

    expect(result).toEqual({ ok: true });
    expect(await listGroupsWithCounts()).toMatchObject([{ name: "Теннис по средам", contactCount: 12 }]);
  });

  it("refuses a name that another group already has, whatever the letter case", async () => {
    await insertGroup("Семья");
    const tennis = await insertGroup("Теннис");

    const result = await renameGroup(tennis.id, "семья");

    expect(result).toEqual({ ok: false, error: "Группа «Семья» уже есть" });
    expect((await getGroup(tennis.id))?.name).toBe("Теннис");
  });

  it("allows changing only the letter case of the name", async () => {
    const tennis = await insertGroup("теннис");

    const result = await renameGroup(tennis.id, "Теннис");

    expect(result).toEqual({ ok: true });
    expect((await getGroup(tennis.id))?.name).toBe("Теннис");
  });

  it("keeps the number of the group, so a saved address leads to the renamed group", async () => {
    const tennis = await insertGroup("Теннис");

    await renameGroup(tennis.id, "Теннис по средам");

    expect(await getGroup(tennis.id)).toEqual({ id: tennis.id, name: "Теннис по средам" });
  });

  it("says the group is gone when it was deleted in another tab", async () => {
    const result = await renameGroup(999, "Теннис");

    expect(result).toEqual({ ok: false, error: "Этой группы уже нет. Обновите страницу." });
  });
});

describe("deleteGroup", () => {
  it("removes the group and keeps its people with their notes and other groups", async () => {
    const anna = await insertContact("Анна");
    await db.insert(notes).values({ contactId: anna.id, body: "Встретились на корте" });
    const tennis = await insertGroup("Теннис");
    const family = await insertGroup("Семья");
    await addToGroup(anna.id, tennis.id);
    await addToGroup(anna.id, family.id);

    const result = await deleteGroup(tennis.id);

    expect(result).toEqual({ ok: true });
    expect((await listGroups()).map((group) => group.name)).toEqual(["Семья"]);
    expect(await db.select().from(contacts)).toHaveLength(1);
    expect(await db.select({ body: notes.body }).from(notes)).toEqual([{ body: "Встретились на корте" }]);
    expect(await db.select().from(contactGroups)).toEqual([{ contactId: anna.id, groupId: family.id }]);
  });

  it("says the group is gone when it was already deleted in another tab", async () => {
    const tennis = await insertGroup("Теннис");
    await deleteGroup(tennis.id);

    expect(await deleteGroup(tennis.id)).toEqual({
      ok: false,
      error: "Этой группы уже нет. Обновите страницу.",
    });
  });
});

async function groupNamesOf(contactId: number): Promise<string[]> {
  return (await listContactGroups(contactId)).map((group) => group.name);
}

async function countsByName(): Promise<Record<string, number>> {
  const groupsWithCounts = await listGroupsWithCounts();
  return Object.fromEntries(groupsWithCounts.map(({ name, contactCount }) => [name, contactCount]));
}

describe("groups of a person", () => {
  it("puts a person in several groups", async () => {
    const anna = await insertContact("Анна");
    const family = await insertGroup("Семья");
    const tennis = await insertGroup("Теннис");

    expect(await addContactToGroup(anna.id, family.id)).toEqual({ ok: true });
    expect(await addContactToGroup(anna.id, tennis.id)).toEqual({ ok: true });

    expect(await groupNamesOf(anna.id)).toEqual(["Семья", "Теннис"]);
    expect(await countsByName()).toEqual({ Семья: 1, Теннис: 1 });
  });

  it("lists the groups of a person alphabetically, ignoring letter case", async () => {
    const anna = await insertContact("Анна");
    for (const name of ["Теннис", "аналитики", "Семья"]) {
      await addToGroup(anna.id, (await insertGroup(name)).id);
    }

    expect(await groupNamesOf(anna.id)).toEqual(["аналитики", "Семья", "Теннис"]);
  });

  it("lists no groups for a person who is in none", async () => {
    const boris = await insertContact("Борис");
    await insertGroup("Семья");

    expect(await listContactGroups(boris.id)).toEqual([]);
  });

  it("shows the same groups on every read, as in another browser", async () => {
    const anna = await insertContact("Анна");
    const tennis = await insertGroup("Теннис");
    await addContactToGroup(anna.id, tennis.id);

    expect(await groupNamesOf(anna.id)).toEqual(["Теннис"]);
    expect(await groupNamesOf(anna.id)).toEqual(["Теннис"]);
    expect(await countsByName()).toEqual({ Теннис: 1 });
  });

  it("leaves a person in a group once when added twice", async () => {
    const anna = await insertContact("Анна");
    const tennis = await insertGroup("Теннис");

    await addContactToGroup(anna.id, tennis.id);
    expect(await addContactToGroup(anna.id, tennis.id)).toEqual({ ok: true });

    expect(await groupNamesOf(anna.id)).toEqual(["Теннис"]);
  });

  it("removes a person from one group only", async () => {
    const anna = await insertContact("Анна");
    const family = await insertGroup("Семья");
    const tennis = await insertGroup("Теннис");
    await addToGroup(anna.id, family.id);
    await addToGroup(anna.id, tennis.id);

    expect(await removeContactFromGroup(anna.id, tennis.id)).toEqual({ ok: true });

    expect(await groupNamesOf(anna.id)).toEqual(["Семья"]);
    expect(await countsByName()).toEqual({ Семья: 1, Теннис: 0 });
  });

  it("keeps the group when its last person is removed", async () => {
    const anna = await insertContact("Анна");
    const yoga = await insertGroup("Йога");
    await addToGroup(anna.id, yoga.id);

    await removeContactFromGroup(anna.id, yoga.id);

    expect(await countsByName()).toEqual({ Йога: 0 });
  });

  it("does not mind removing a person from a group they are not in", async () => {
    const anna = await insertContact("Анна");
    const tennis = await insertGroup("Теннис");

    expect(await removeContactFromGroup(anna.id, tennis.id)).toEqual({ ok: true });
  });

  it("says the contact is gone when it was deleted in another tab", async () => {
    const tennis = await insertGroup("Теннис");

    expect(await addContactToGroup(999, tennis.id)).toEqual({
      ok: false,
      error: "Этот контакт не найден. Вернитесь к списку и откройте его заново.",
    });
  });

  it("says the group is gone when it was deleted in another tab", async () => {
    const anna = await insertContact("Анна");

    expect(await addContactToGroup(anna.id, 999)).toEqual({
      ok: false,
      error: "Этой группы уже нет. Обновите страницу.",
    });
  });
});

describe("addContactToGroupByName", () => {
  it("creates a new group and puts the person in it", async () => {
    const anna = await insertContact("Анна");

    const result = await addContactToGroupByName(anna.id, "Йога");

    expect(result).toMatchObject({ ok: true, group: { name: "Йога" } });
    expect(await groupNamesOf(anna.id)).toEqual(["Йога"]);
    expect(await countsByName()).toEqual({ Йога: 1 });
  });

  it("puts the person in the existing group when the name differs only in letter case", async () => {
    const anna = await insertContact("Анна");
    await insertGroup("Семья");

    const result = await addContactToGroupByName(anna.id, "семья");

    expect(result).toMatchObject({ ok: true, group: { name: "Семья" } });
    expect(await groupNamesOf(anna.id)).toEqual(["Семья"]);
    expect((await listGroups()).map((group) => group.name)).toEqual(["Семья"]);
  });

  it("changes nothing for a person who is already in the group", async () => {
    const anna = await insertContact("Анна");
    const tennis = await insertGroup("Теннис");
    await addToGroup(anna.id, tennis.id);

    const result = await addContactToGroupByName(anna.id, "теннис");

    expect(result).toMatchObject({ ok: true, group: { name: "Теннис" } });
    expect(await groupNamesOf(anna.id)).toEqual(["Теннис"]);
    expect((await listGroups()).map((group) => group.name)).toEqual(["Теннис"]);
  });

  it("creates no group when the contact was deleted in another tab", async () => {
    const result = await addContactToGroupByName(999, "Йога");

    expect(result).toEqual({
      ok: false,
      error: "Этот контакт не найден. Вернитесь к списку и откройте его заново.",
    });
    expect(await listGroups()).toEqual([]);
  });
});

describe("listGroupsOfContacts", () => {
  it("gives the groups of every person in one go, each alphabetically", async () => {
    const anna = await insertContact("Анна");
    const boris = await insertContact("Борис");
    const vera = await insertContact("Вера");
    const family = await insertGroup("Семья");
    const analysts = await insertGroup("аналитики");
    const tennis = await insertGroup("Теннис");
    await addToGroup(anna.id, tennis.id);
    await addToGroup(anna.id, family.id);
    await addToGroup(boris.id, tennis.id);
    await addToGroup(boris.id, analysts.id);

    const byContact = await listGroupsOfContacts([anna.id, boris.id, vera.id]);

    expect(byContact.get(anna.id)?.map((group) => group.name)).toEqual(["Семья", "Теннис"]);
    expect(byContact.get(boris.id)?.map((group) => group.name)).toEqual(["аналитики", "Теннис"]);
    expect(byContact.get(vera.id)).toBeUndefined();
  });

  it("gives nothing for no people", async () => {
    expect((await listGroupsOfContacts([])).size).toBe(0);
  });
});
