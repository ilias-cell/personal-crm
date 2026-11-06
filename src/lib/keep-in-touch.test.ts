import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { notes } from "@/db/schema";
import { listOverdueContacts } from "@/lib/keep-in-touch";
import { addToGroup, insertContact, insertGroup } from "@/test/factories";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

async function addNoteDaysAgo(contactId: number, days: number) {
  await db.insert(notes).values({ contactId, body: "Поговорили", createdAt: daysAgo(days) });
}

describe("people to get in touch with", () => {
  it("shows the frequency, the last note and how overdue the person is", async () => {
    const boris = await insertContact("Борис", { touchFrequency: "week" });
    await addNoteDaysAgo(boris.id, 30);
    await addNoteDaysAgo(boris.id, 23);

    const [person] = await listOverdueContacts();

    expect(person).toMatchObject({
      id: boris.id,
      name: "Борис",
      touchFrequency: "week",
      overdueDays: 16,
    });
    expect(person.lastNoteAt?.getTime()).toBeCloseTo(daysAgo(23).getTime(), -4);
  });

  it("has no last note for a person without notes, counting from the day the frequency was set", async () => {
    await insertContact("Вера", { touchFrequency: "week", touchRestartedAt: daysAgo(10) });

    const [person] = await listOverdueContacts();

    expect(person).toMatchObject({ name: "Вера", lastNoteAt: null, overdueDays: 3 });
  });

  it("does not show a person whose period has not ended", async () => {
    const anna = await insertContact("Анна", { touchFrequency: "month" });
    await addNoteDaysAgo(anna.id, 2);

    expect(await listOverdueContacts()).toEqual([]);
  });

  it("gives the groups of the person alphabetically", async () => {
    const boris = await insertContact("Борис", {
      touchFrequency: "week",
      touchRestartedAt: daysAgo(10),
    });
    for (const name of ["Теннис", "Аналитики"]) {
      await addToGroup(boris.id, (await insertGroup(name)).id);
    }

    const [person] = await listOverdueContacts();

    expect(person.groups.map((group) => group.name)).toEqual(["Аналитики", "Теннис"]);
  });

  it("gives an empty list of groups to a person who is in none", async () => {
    await insertContact("Вера", { touchFrequency: "week", touchRestartedAt: daysAgo(10) });
    await insertGroup("Семья");

    const [person] = await listOverdueContacts();

    expect(person.groups).toEqual([]);
  });

  it("gives the same people with the same groups on every read, as in another browser", async () => {
    const boris = await insertContact("Борис", {
      touchFrequency: "week",
      touchRestartedAt: daysAgo(10),
    });
    await addToGroup(boris.id, (await insertGroup("Теннис")).id);

    expect(await listOverdueContacts()).toEqual(await listOverdueContacts());
    expect((await listOverdueContacts())[0].groups).toHaveLength(1);
  });
});
