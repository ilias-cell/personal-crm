import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { notes, type User } from "@/db/schema";
import { countContacts, countNotes, getContact, listContacts, listNotes } from "@/lib/contacts";
import {
  addToGroup,
  insertContact,
  insertContacts,
  insertGroup,
  insertGroupWithPeople,
  insertManyContacts,
  insertUser,
} from "@/test/factories";

// The user whose data a test works with; every test starts with its own, because the tables are emptied.
let owner: User;
beforeEach(async () => {
  owner = await insertUser("owner@example.com");
});

async function namesOnPage(
  search: string,
  page: number,
  groupId: number | null = null,
): Promise<string[]> {
  return (await listContacts(owner.id, search, page, groupId)).map((contact) => contact.name);
}

describe("test database", () => {
  it("has no contacts when a test starts", async () => {
    expect(await countContacts(owner.id)).toBe(0);
  });
});

describe("contact list", () => {
  it("shows the newest contacts first", async () => {
    await insertContacts(owner.id, ["Анна", "Борис", "Вера"]);

    expect(await namesOnPage("", 1)).toEqual(["Вера", "Борис", "Анна"]);
  });

  it("finds a person from a far page by a search", async () => {
    const names = Array.from({ length: 120 }, (_, index) => `Человек ${index + 1}`);
    await insertManyContacts(owner.id, ["Эдуард Редкий", ...names]);

    // Without a search the oldest contact is on the last page, with it — on the first.
    expect(await namesOnPage("", 1)).not.toContain("Эдуард Редкий");
    expect(await namesOnPage("редкий", 1)).toEqual(["Эдуард Редкий"]);
    expect(await countContacts(owner.id, "редкий")).toBe(1);
  });

  it("splits the found people into pages of 50", async () => {
    await insertManyContacts(
      owner.id,
      Array.from({ length: 120 }, (_, index) => `Анна ${index + 1}`),
    );
    await insertContact(owner.id, "Борис");

    expect(await countContacts(owner.id, "анна")).toBe(120);
    const firstPage = await namesOnPage("анна", 1);
    const secondPage = await namesOnPage("анна", 2);
    const thirdPage = await namesOnPage("анна", 3);
    expect([firstPage.length, secondPage.length, thirdPage.length]).toEqual([50, 50, 20]);
    expect(new Set([...firstPage, ...secondPage, ...thirdPage]).size).toBe(120);
  });
});

describe("contact list of a group", () => {
  it("shows only the people of the chosen group, the newest first", async () => {
    const [anna, boris, vera, gleb] = await insertContacts(owner.id, [
      "Анна",
      "Борис",
      "Вера",
      "Глеб",
    ]);
    const tennis = await insertGroup(owner.id, "Теннис");
    for (const person of [anna, vera, gleb]) await addToGroup(person.id, tennis.id);

    expect(await namesOnPage("", 1, tennis.id)).toEqual(["Глеб", "Вера", "Анна"]);
    expect(await countContacts(owner.id, "", tennis.id)).toBe(3);
    expect(await countContacts(owner.id)).toBe(4);
    expect(boris).toBeDefined();
  });

  it("shows another group's people after switching groups", async () => {
    const [anna, boris] = await insertContacts(owner.id, ["Анна", "Борис"]);
    const tennis = await insertGroup(owner.id, "Теннис");
    const family = await insertGroup(owner.id, "Семья");
    await addToGroup(anna.id, tennis.id);
    await addToGroup(boris.id, family.id);

    expect(await namesOnPage("", 1, tennis.id)).toEqual(["Анна"]);
    expect(await namesOnPage("", 1, family.id)).toEqual(["Борис"]);
  });

  it("splits a big group into pages of 50 that continue each other", async () => {
    const { group, people } = await insertGroupWithPeople(owner.id, "Работа", 120);
    await insertContact(owner.id, "Не из группы");

    expect(await countContacts(owner.id, "", group.id)).toBe(120);
    const first = await listContacts(owner.id, "", 1, group.id);
    const second = await listContacts(owner.id, "", 2, group.id);
    const third = await listContacts(owner.id, "", 3, group.id);
    expect([first.length, second.length, third.length]).toEqual([50, 50, 20]);

    const newestFirst = [...people].reverse().map((person) => person.id);
    expect([...first, ...second, ...third].map((contact) => contact.id)).toEqual(newestFirst);
  });

  it("shows a small group on one page", async () => {
    const { group } = await insertGroupWithPeople(owner.id, "Теннис", 12);
    await insertManyContacts(owner.id, ["Посторонний 1", "Посторонний 2"]);

    expect(await listContacts(owner.id, "", 1, group.id)).toHaveLength(12);
    expect(await listContacts(owner.id, "", 2, group.id)).toHaveLength(0);
  });

  it("searches among the people of the group only", async () => {
    const [annaInTennis, annaInFamily, boris] = await insertContacts(owner.id, [
      "Анна Теннисная",
      "Анна Семейная",
      "Борис",
    ]);
    const tennis = await insertGroup(owner.id, "Теннис");
    const family = await insertGroup(owner.id, "Семья");
    await addToGroup(annaInTennis.id, tennis.id);
    await addToGroup(boris.id, tennis.id);
    await addToGroup(annaInFamily.id, family.id);

    expect(await namesOnPage("анна", 1, tennis.id)).toEqual(["Анна Теннисная"]);
    expect(await countContacts(owner.id, "анна", tennis.id)).toBe(1);
    expect(await countContacts(owner.id, "анна")).toBe(2);
  });

  it("keeps the search when another group is chosen", async () => {
    const [annaInTennis, annaInFamily] = await insertContacts(owner.id, [
      "Анна Теннисная",
      "Анна Семейная",
    ]);
    const tennis = await insertGroup(owner.id, "Теннис");
    const family = await insertGroup(owner.id, "Семья");
    await addToGroup(annaInTennis.id, tennis.id);
    await addToGroup(annaInFamily.id, family.id);

    expect(await namesOnPage("анна", 1, family.id)).toEqual(["Анна Семейная"]);
  });

  it("finds nobody when the search matches no one in the group", async () => {
    const [anna, boris] = await insertContacts(owner.id, ["Анна", "Борис"]);
    const tennis = await insertGroup(owner.id, "Теннис");
    await addToGroup(boris.id, tennis.id);

    expect(await namesOnPage("анна", 1, tennis.id)).toEqual([]);
    expect(await countContacts(owner.id, "анна", tennis.id)).toBe(0);
    expect(anna).toBeDefined();
  });

  it("counts nobody in an empty group", async () => {
    await insertContact(owner.id, "Анна");
    const yoga = await insertGroup(owner.id, "Йога");

    expect(await countContacts(owner.id, "", yoga.id)).toBe(0);
    expect(await namesOnPage("", 1, yoga.id)).toEqual([]);
  });
});

describe("groups in the contact list", () => {
  it("gives every listed person their groups alphabetically", async () => {
    const [anna] = await insertContacts(owner.id, ["Анна"]);
    for (const name of ["Теннис", "Семья"]) {
      await addToGroup(anna.id, (await insertGroup(owner.id, name)).id);
    }

    const [listed] = await listContacts(owner.id, "", 1);

    expect(listed.groups.map((group) => group.name)).toEqual(["Семья", "Теннис"]);
  });

  it("gives an empty list to a person without groups", async () => {
    await insertContact(owner.id, "Борис");
    await insertGroup(owner.id, "Семья");

    const [listed] = await listContacts(owner.id, "", 1);

    expect(listed.groups).toEqual([]);
  });

  it("shows all the groups of a person on the list of one of them", async () => {
    const [anna] = await insertContacts(owner.id, ["Анна"]);
    const tennis = await insertGroup(owner.id, "Теннис");
    await addToGroup(anna.id, tennis.id);
    await addToGroup(anna.id, (await insertGroup(owner.id, "Семья")).id);

    const [listed] = await listContacts(owner.id, "", 1, tennis.id);

    expect(listed.groups.map((group) => group.name)).toEqual(["Семья", "Теннис"]);
  });
});

describe("contacts of other users", () => {
  it("are not in the list, and the count is of own contacts only", async () => {
    const other = await insertUser("other@example.com");
    await insertContact(other.id, "Вера Климова");
    await insertContact(owner.id, "Глеб Орлов");

    expect(await namesOnPage("", 1)).toEqual(["Глеб Орлов"]);
    expect(await countContacts(owner.id)).toBe(1);
  });

  it("are not found by a search, while the other user finds their own", async () => {
    const other = await insertUser("other@example.com");
    await insertContact(other.id, "Вера Климова");

    expect(await namesOnPage("климова", 1)).toEqual([]);
    expect(await countContacts(owner.id, "климова")).toBe(0);
    expect((await listContacts(other.id, "климова", 1)).map((contact) => contact.name)).toEqual([
      "Вера Климова",
    ]);
  });

  it("do not change what the owner of the contact sees", async () => {
    const other = await insertUser("other@example.com");
    await insertContact(owner.id, "Вера Климова");
    await insertContact(other.id, "Глеб Орлов");

    expect(await namesOnPage("", 1)).toEqual(["Вера Климова"]);
  });

  it("do not open by id: the card is empty, as for a contact that does not exist", async () => {
    const other = await insertUser("other@example.com");
    const foreign = await insertContact(other.id, "Вера Климова");

    expect(await getContact(owner.id, foreign.id)).toBeNull();
    expect(await getContact(owner.id, foreign.id)).toEqual(await getContact(owner.id, 999999));
    expect((await getContact(other.id, foreign.id))?.name).toBe("Вера Климова");
  });

  it("have no notes to read or count", async () => {
    const other = await insertUser("other@example.com");
    const foreign = await insertContact(other.id, "Вера Климова");
    await db.insert(notes).values({ contactId: foreign.id, body: "Встретились" });

    expect(await listNotes(owner.id, foreign.id)).toEqual([]);
    expect(await countNotes(owner.id, foreign.id)).toBe(0);
    expect(await countNotes(other.id, foreign.id)).toBe(1);
    expect((await listNotes(other.id, foreign.id)).map((note) => note.body)).toEqual([
      "Встретились",
    ]);
  });
});
