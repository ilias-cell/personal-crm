import { beforeEach, describe, expect, it } from "vitest";

import type { User } from "@/db/schema";
import { listUpcomingBirthdays } from "@/lib/birthdays";
import { insertContact, insertUser } from "@/test/factories";

let owner: User;
beforeEach(async () => {
  owner = await insertUser("owner@example.com");
});

// 23 November 2026, noon in Moscow.
const NOON = new Date("2026-11-23T09:00:00Z");

async function names(ownerId: string, asOf: Date = NOON): Promise<string[]> {
  return (await listUpcomingBirthdays(ownerId, { asOf })).map((person) => person.name);
}

describe("listUpcomingBirthdays", () => {
  it("gives the people with a birthday in the next 7 days, the nearest first", async () => {
    await insertContact(owner.id, "Борис", { birthDay: 28, birthMonth: 11 });
    await insertContact(owner.id, "Вера", { birthDay: 23, birthMonth: 11 });
    await insertContact(owner.id, "Глеб", { birthDay: 25, birthMonth: 11 });

    expect(await names(owner.id)).toEqual(["Вера", "Глеб", "Борис"]);
  });

  it("gives the days to the birthday and the age", async () => {
    await insertContact(owner.id, "Анна", { birthDay: 26, birthMonth: 11, birthYear: 1990 });
    await insertContact(owner.id, "Борис", { birthDay: 24, birthMonth: 11 });

    const people = await listUpcomingBirthdays(owner.id, { asOf: NOON });

    expect(
      people.map(({ name, id, daysUntil, age }) => ({ name, hasId: id > 0, daysUntil, age })),
    ).toEqual([
      { name: "Борис", hasId: true, daysUntil: 1, age: null },
      { name: "Анна", hasId: true, daysUntil: 3, age: 36 },
    ]);
  });

  it("includes today and 6 days ahead, and leaves out 7 days ahead and yesterday", async () => {
    await insertContact(owner.id, "Сегодня", { birthDay: 23, birthMonth: 11 });
    await insertContact(owner.id, "Через шесть", { birthDay: 29, birthMonth: 11 });
    await insertContact(owner.id, "Через семь", { birthDay: 30, birthMonth: 11 });
    await insertContact(owner.id, "Вчера", { birthDay: 22, birthMonth: 11 });

    expect(await names(owner.id)).toEqual(["Сегодня", "Через шесть"]);
  });

  it("puts people with one day by name", async () => {
    await insertContact(owner.id, "Борис", { birthDay: 25, birthMonth: 11 });
    await insertContact(owner.id, "Анна", { birthDay: 25, birthMonth: 11 });

    expect(await names(owner.id)).toEqual(["Анна", "Борис"]);
  });

  it("leaves out the contacts without a date", async () => {
    await insertContact(owner.id, "Без даты");
    await insertContact(owner.id, "С датой", { birthDay: 24, birthMonth: 11 });

    expect(await names(owner.id)).toEqual(["С датой"]);
  });

  it("gives nobody when nobody has a date, and when nobody has a contact at all", async () => {
    expect(await names(owner.id)).toEqual([]);
    await insertContact(owner.id, "Без даты");
    expect(await names(owner.id)).toEqual([]);
  });

  it("gives nobody when all the birthdays are far away", async () => {
    await insertContact(owner.id, "Далеко", { birthDay: 14, birthMonth: 3 });

    expect(await names(owner.id)).toEqual([]);
  });

  it("looks across the end of the year", async () => {
    await insertContact(owner.id, "Анна", { birthDay: 2, birthMonth: 1 });

    const people = await listUpcomingBirthdays(owner.id, {
      asOf: new Date("2026-12-29T09:00:00Z"),
    });

    expect(people.map((person) => [person.name, person.daysUntil])).toEqual([["Анна", 4]]);
  });

  it("does not show a contact of another user", async () => {
    const other = await insertUser("other@example.com");
    await insertContact(other.id, "Вера Климова", { birthDay: 23, birthMonth: 11 });
    await insertContact(owner.id, "Глеб Орлов", { birthDay: 24, birthMonth: 11 });

    expect(await names(owner.id)).toEqual(["Глеб Орлов"]);
    expect(await names(other.id)).toEqual(["Вера Климова"]);
  });

  it("shows nothing to a user who has no birthdays of their own", async () => {
    const other = await insertUser("other@example.com");
    await insertContact(other.id, "Вера Климова", { birthDay: 23, birthMonth: 11 });

    expect(await names(owner.id)).toEqual([]);
  });

  describe("the day changes at midnight in Moscow, not in UTC", () => {
    it("still counts the day before at 23:59 in Moscow", async () => {
      await insertContact(owner.id, "Анна", { birthDay: 23, birthMonth: 11 });

      // 20:59 UTC on 22 November is 23:59 in Moscow: the birthday is tomorrow.
      const people = await listUpcomingBirthdays(owner.id, {
        asOf: new Date("2026-11-22T20:59:00Z"),
      });

      expect(people.map((person) => person.daysUntil)).toEqual([1]);
    });

    it("sees the new Moscow day while it is still the old day in UTC", async () => {
      await insertContact(owner.id, "Анна", { birthDay: 23, birthMonth: 11 });

      // 21:30 UTC on 22 November is 00:30 on 23 November in Moscow: the birthday is today.
      const people = await listUpcomingBirthdays(owner.id, {
        asOf: new Date("2026-11-22T21:30:00Z"),
      });

      expect(people.map((person) => person.daysUntil)).toEqual([0]);
    });

    it("drops yesterday's birthday once it is past midnight in Moscow", async () => {
      await insertContact(owner.id, "Анна", { birthDay: 22, birthMonth: 11 });

      expect(await names(owner.id, new Date("2026-11-22T20:59:00Z"))).toEqual(["Анна"]);
      expect(await names(owner.id, new Date("2026-11-22T21:30:00Z"))).toEqual([]);
    });
  });
});
