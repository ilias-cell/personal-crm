import { describe, expect, it } from "vitest";

import { countContacts, listContacts } from "@/lib/contacts";
import { addToGroup, insertContact, insertContacts, insertGroup, insertGroupWithPeople, insertManyContacts } from "@/test/factories";

async function namesOnPage(search: string, page: number, groupId: number | null = null): Promise<string[]> {
  return (await listContacts(search, page, groupId)).map((contact) => contact.name);
}

describe("test database", () => {
  it("has no contacts when a test starts", async () => {
    expect(await countContacts()).toBe(0);
  });
});

describe("contact list", () => {
  it("shows the newest contacts first", async () => {
    await insertContacts(["Анна", "Борис", "Вера"]);

    expect(await namesOnPage("", 1)).toEqual(["Вера", "Борис", "Анна"]);
  });

  it("finds a person from a far page by a search", async () => {
    const names = Array.from({ length: 120 }, (_, index) => `Человек ${index + 1}`);
    await insertManyContacts(["Эдуард Редкий", ...names]);

    // Without a search the oldest contact is on the last page, with it — on the first.
    expect(await namesOnPage("", 1)).not.toContain("Эдуард Редкий");
    expect(await namesOnPage("редкий", 1)).toEqual(["Эдуард Редкий"]);
    expect(await countContacts("редкий")).toBe(1);
  });

  it("splits the found people into pages of 50", async () => {
    await insertManyContacts(Array.from({ length: 120 }, (_, index) => `Анна ${index + 1}`));
    await insertContact("Борис");

    expect(await countContacts("анна")).toBe(120);
    const firstPage = await namesOnPage("анна", 1);
    const secondPage = await namesOnPage("анна", 2);
    const thirdPage = await namesOnPage("анна", 3);
    expect([firstPage.length, secondPage.length, thirdPage.length]).toEqual([50, 50, 20]);
    expect(new Set([...firstPage, ...secondPage, ...thirdPage]).size).toBe(120);
  });
});

describe("contact list of a group", () => {
  it("shows only the people of the chosen group, the newest first", async () => {
    const [anna, boris, vera, gleb] = await insertContacts(["Анна", "Борис", "Вера", "Глеб"]);
    const tennis = await insertGroup("Теннис");
    for (const person of [anna, vera, gleb]) await addToGroup(person.id, tennis.id);

    expect(await namesOnPage("", 1, tennis.id)).toEqual(["Глеб", "Вера", "Анна"]);
    expect(await countContacts("", tennis.id)).toBe(3);
    expect(await countContacts()).toBe(4);
    expect(boris).toBeDefined();
  });

  it("shows another group's people after switching groups", async () => {
    const [anna, boris] = await insertContacts(["Анна", "Борис"]);
    const tennis = await insertGroup("Теннис");
    const family = await insertGroup("Семья");
    await addToGroup(anna.id, tennis.id);
    await addToGroup(boris.id, family.id);

    expect(await namesOnPage("", 1, tennis.id)).toEqual(["Анна"]);
    expect(await namesOnPage("", 1, family.id)).toEqual(["Борис"]);
  });

  it("splits a big group into pages of 50 that continue each other", async () => {
    const { group, people } = await insertGroupWithPeople("Работа", 120);
    await insertContact("Не из группы");

    expect(await countContacts("", group.id)).toBe(120);
    const first = await listContacts("", 1, group.id);
    const second = await listContacts("", 2, group.id);
    const third = await listContacts("", 3, group.id);
    expect([first.length, second.length, third.length]).toEqual([50, 50, 20]);

    const newestFirst = [...people].reverse().map((person) => person.id);
    expect([...first, ...second, ...third].map((contact) => contact.id)).toEqual(newestFirst);
  });

  it("shows a small group on one page", async () => {
    const { group } = await insertGroupWithPeople("Теннис", 12);
    await insertManyContacts(["Посторонний 1", "Посторонний 2"]);

    expect(await listContacts("", 1, group.id)).toHaveLength(12);
    expect(await listContacts("", 2, group.id)).toHaveLength(0);
  });

  it("searches among the people of the group only", async () => {
    const [annaInTennis, annaInFamily, boris] = await insertContacts(["Анна Теннисная", "Анна Семейная", "Борис"]);
    const tennis = await insertGroup("Теннис");
    const family = await insertGroup("Семья");
    await addToGroup(annaInTennis.id, tennis.id);
    await addToGroup(boris.id, tennis.id);
    await addToGroup(annaInFamily.id, family.id);

    expect(await namesOnPage("анна", 1, tennis.id)).toEqual(["Анна Теннисная"]);
    expect(await countContacts("анна", tennis.id)).toBe(1);
    expect(await countContacts("анна")).toBe(2);
  });

  it("keeps the search when another group is chosen", async () => {
    const [annaInTennis, annaInFamily] = await insertContacts(["Анна Теннисная", "Анна Семейная"]);
    const tennis = await insertGroup("Теннис");
    const family = await insertGroup("Семья");
    await addToGroup(annaInTennis.id, tennis.id);
    await addToGroup(annaInFamily.id, family.id);

    expect(await namesOnPage("анна", 1, family.id)).toEqual(["Анна Семейная"]);
  });

  it("finds nobody when the search matches no one in the group", async () => {
    const [anna, boris] = await insertContacts(["Анна", "Борис"]);
    const tennis = await insertGroup("Теннис");
    await addToGroup(boris.id, tennis.id);

    expect(await namesOnPage("анна", 1, tennis.id)).toEqual([]);
    expect(await countContacts("анна", tennis.id)).toBe(0);
    expect(anna).toBeDefined();
  });

  it("counts nobody in an empty group", async () => {
    await insertContact("Анна");
    const yoga = await insertGroup("Йога");

    expect(await countContacts("", yoga.id)).toBe(0);
    expect(await namesOnPage("", 1, yoga.id)).toEqual([]);
  });
});

describe("groups in the contact list", () => {
  it("gives every listed person their groups alphabetically", async () => {
    const [anna] = await insertContacts(["Анна"]);
    for (const name of ["Теннис", "Семья"]) {
      await addToGroup(anna.id, (await insertGroup(name)).id);
    }

    const [listed] = await listContacts("", 1);

    expect(listed.groups.map((group) => group.name)).toEqual(["Семья", "Теннис"]);
  });

  it("gives an empty list to a person without groups", async () => {
    await insertContact("Борис");
    await insertGroup("Семья");

    const [listed] = await listContacts("", 1);

    expect(listed.groups).toEqual([]);
  });

  it("shows all the groups of a person on the list of one of them", async () => {
    const [anna] = await insertContacts(["Анна"]);
    const tennis = await insertGroup("Теннис");
    await addToGroup(anna.id, tennis.id);
    await addToGroup(anna.id, (await insertGroup("Семья")).id);

    const [listed] = await listContacts("", 1, tennis.id);

    expect(listed.groups.map((group) => group.name)).toEqual(["Семья", "Теннис"]);
  });
});
