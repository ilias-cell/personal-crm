import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { contacts, notes, type TouchFrequency, type User } from "@/db/schema";
import {
  countOverdueContacts,
  hasAnyTouchFrequency,
  listOverdueContacts,
} from "@/lib/keep-in-touch";
import { addToGroup, insertContact, insertGroup, insertUser } from "@/test/factories";

// The user whose data a test works with; every test starts with its own, because the tables are emptied.
let owner: User;
beforeEach(async () => {
  owner = await insertUser("owner@example.com");
});

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

function daysLater(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

// A moment on the owner's clock in Moscow, e.g. moscow("2026-10-01 23:30").
function moscow(dateTime: string): Date {
  const [day, time = "12:00"] = dateTime.split(" ");
  return new Date(`${day}T${time}:00+03:00`);
}

async function addNote(contactId: number, createdAt: Date) {
  await db.insert(notes).values({ contactId, body: "Поговорили", createdAt });
}

async function addNoteDaysAgo(contactId: number, days: number) {
  await addNote(contactId, daysAgo(days));
}

// A person whose last note was at this moment.
async function personWithNote(name: string, touchFrequency: TouchFrequency, noteAt: Date) {
  const contact = await insertContact(owner.id, name, { touchFrequency });
  await addNote(contact.id, noteAt);
  return contact;
}

async function overdueNames(asOf: Date): Promise<string[]> {
  return (await listOverdueContacts(owner.id, { asOf })).map((person) => person.name);
}

describe("people to get in touch with", () => {
  it("shows the frequency, the last note and how overdue the person is", async () => {
    const boris = await personWithNote("Борис", "week", moscow("2026-09-20"));
    await addNote(boris.id, moscow("2026-10-01"));

    const [person] = await listOverdueContacts(owner.id, { asOf: moscow("2026-10-24") });

    expect(person).toMatchObject({
      id: boris.id,
      name: "Борис",
      touchFrequency: "week",
      lastNoteAt: moscow("2026-10-01"),
      overdueDays: 16,
    });
  });

  it("has no last note for a person without notes, counting from the day the frequency was set", async () => {
    await insertContact(owner.id, "Вера", {
      touchFrequency: "week",
      touchRestartedAt: daysAgo(10),
    });

    const [person] = await listOverdueContacts(owner.id);

    expect(person).toMatchObject({ name: "Вера", lastNoteAt: null, overdueDays: 3 });
  });

  it("does not show a person whose period has not ended", async () => {
    const anna = await insertContact(owner.id, "Анна", { touchFrequency: "month" });
    await addNoteDaysAgo(anna.id, 2);

    expect(await listOverdueContacts(owner.id)).toEqual([]);
  });

  it("gives the groups of the person alphabetically", async () => {
    const boris = await insertContact(owner.id, "Борис", {
      touchFrequency: "week",
      touchRestartedAt: daysAgo(10),
    });
    for (const name of ["Теннис", "Аналитики"]) {
      await addToGroup(boris.id, (await insertGroup(owner.id, name)).id);
    }

    const [person] = await listOverdueContacts(owner.id);

    expect(person.groups.map((group) => group.name)).toEqual(["Аналитики", "Теннис"]);
  });

  it("gives an empty list of groups to a person who is in none", async () => {
    await insertContact(owner.id, "Вера", {
      touchFrequency: "week",
      touchRestartedAt: daysAgo(10),
    });
    await insertGroup(owner.id, "Семья");

    const [person] = await listOverdueContacts(owner.id);

    expect(person.groups).toEqual([]);
  });

  it("gives the same people with the same groups on every read, as in another browser", async () => {
    const boris = await insertContact(owner.id, "Борис", {
      touchFrequency: "week",
      touchRestartedAt: daysAgo(10),
    });
    await addToGroup(boris.id, (await insertGroup(owner.id, "Теннис")).id);

    expect(await listOverdueContacts(owner.id)).toEqual(await listOverdueContacts(owner.id));
    expect((await listOverdueContacts(owner.id))[0].groups).toHaveLength(1);
  });
});

describe("the period on the calendar, in Moscow time", () => {
  it("shows a weekly person on the day the period ends, as due today", async () => {
    await personWithNote("Анна", "week", moscow("2026-10-01"));

    const [person] = await listOverdueContacts(owner.id, { asOf: moscow("2026-10-08") });

    expect(person).toMatchObject({ name: "Анна", overdueDays: 0 });
  });

  it("does not show a weekly person the day before the period ends", async () => {
    await personWithNote("Анна", "week", moscow("2026-10-01"));

    expect(await overdueNames(moscow("2026-10-07"))).toEqual([]);
  });

  it("ends a month that starts on 31 January on the last day of February", async () => {
    await personWithNote("Анна", "month", moscow("2026-01-31"));

    expect(await overdueNames(moscow("2026-02-27"))).toEqual([]);
    expect(await listOverdueContacts(owner.id, { asOf: moscow("2026-02-28") })).toMatchObject([
      { name: "Анна", overdueDays: 0 },
    ]);
  });

  it("counts a quarter and a year by the calendar", async () => {
    await personWithNote("Анна", "quarter", moscow("2026-01-15"));
    await personWithNote("Борис", "year", moscow("2026-01-15"));

    expect(await overdueNames(moscow("2026-04-14"))).toEqual([]);
    expect(await overdueNames(moscow("2026-04-15"))).toEqual(["Анна"]);
    expect(await overdueNames(moscow("2027-01-14"))).toEqual(["Анна"]);
    expect(await overdueNames(moscow("2027-01-15"))).toEqual(["Анна", "Борис"]);
  });

  it("takes a note written at 23:30 in Moscow as a note of that day", async () => {
    await personWithNote("Анна", "week", moscow("2026-10-01 23:30"));

    expect(await overdueNames(moscow("2026-10-07 23:59"))).toEqual([]);
    expect(await overdueNames(moscow("2026-10-08 00:01"))).toEqual(["Анна"]);
  });

  it("takes a note written at 00:30 in Moscow as a note of the new day, though in UTC it is still the day before", async () => {
    await personWithNote("Анна", "week", moscow("2026-10-02 00:30"));

    expect(await overdueNames(moscow("2026-10-08 12:00"))).toEqual([]);
    expect(await overdueNames(moscow("2026-10-09 00:01"))).toEqual(["Анна"]);
  });

  it("starts the period over with every new note", async () => {
    const anna = await personWithNote("Анна", "week", moscow("2026-09-01"));
    const today = moscow("2026-10-01");
    await addNote(anna.id, today);

    expect(await overdueNames(today)).toEqual([]);
    expect(await overdueNames(daysLater(today, 6))).toEqual([]);
    expect(await overdueNames(daysLater(today, 7))).toEqual(["Анна"]);
  });

  it("counts from a note written after the frequency was changed", async () => {
    const anna = await insertContact(owner.id, "Анна", {
      touchFrequency: "week",
      touchRestartedAt: moscow("2026-10-01"),
    });
    await addNote(anna.id, moscow("2026-10-05"));

    expect(await overdueNames(moscow("2026-10-11"))).toEqual([]);
    expect(await overdueNames(moscow("2026-10-12"))).toEqual(["Анна"]);
  });

  it("counts from the change of the frequency when it was after the last note", async () => {
    const anna = await insertContact(owner.id, "Анна", {
      touchFrequency: "week",
      touchRestartedAt: moscow("2026-10-05"),
    });
    await addNote(anna.id, moscow("2026-10-01"));

    expect(await overdueNames(moscow("2026-10-11"))).toEqual([]);
    expect(await overdueNames(moscow("2026-10-12"))).toEqual(["Анна"]);
  });
});

describe("the order of the people", () => {
  it("puts the longest overdue first", async () => {
    await personWithNote("Вера", "week", moscow("2026-10-17"));
    await personWithNote("Анна", "week", moscow("2026-10-15"));
    await personWithNote("Борис", "week", moscow("2026-09-17"));

    const people = await listOverdueContacts(owner.id, { asOf: moscow("2026-10-24") });

    expect(people.map(({ name, overdueDays }) => [name, overdueDays])).toEqual([
      ["Борис", 30],
      ["Анна", 2],
      ["Вера", 0],
    ]);
  });

  it("puts people equally overdue by name", async () => {
    await personWithNote("Вера", "week", moscow("2026-10-12"));
    await personWithNote("Анна", "week", moscow("2026-10-12"));

    expect(await overdueNames(moscow("2026-10-24"))).toEqual(["Анна", "Вера"]);
  });
});

describe("the number of people on the home page", () => {
  it("counts only the people whose period has ended", async () => {
    await personWithNote("Анна", "week", moscow("2026-10-01"));
    await personWithNote("Борис", "month", moscow("2026-09-01"));
    await personWithNote("Вера", "week", moscow("2026-10-17"));
    await personWithNote("Глеб", "year", moscow("2026-10-20"));

    expect(await countOverdueContacts(owner.id, { asOf: moscow("2026-10-24") })).toBe(3);
  });

  it("counts nobody when no period has ended", async () => {
    await personWithNote("Анна", "month", moscow("2026-10-20"));

    expect(await countOverdueContacts(owner.id, { asOf: moscow("2026-10-24") })).toBe(0);
  });
});

describe("the empty page", () => {
  it("knows that nobody has a frequency yet", async () => {
    await insertContact(owner.id, "Анна");

    expect(await hasAnyTouchFrequency(owner.id)).toBe(false);
  });

  it("knows that somebody has a frequency, though nobody is overdue", async () => {
    await insertContact(owner.id, "Анна");
    await personWithNote("Борис", "month", daysAgo(1));

    expect(await listOverdueContacts(owner.id)).toEqual([]);
    expect(await hasAnyTouchFrequency(owner.id)).toBe(true);
  });
});

describe("contacts added before keep-in-touch", () => {
  it("have no frequency and never show up, whatever their notes", async () => {
    // Saved without the column, as rows written before the column existed get it after the migration.
    await db.execute(sql`insert into contacts (name, owner_id) values ('Анна', ${owner.id})`);
    const [anna] = await db.select().from(contacts);
    await addNote(anna.id, moscow("2020-01-01"));

    expect(anna.touchFrequency).toBeNull();
    expect(await listOverdueContacts(owner.id)).toEqual([]);
    expect(await countOverdueContacts(owner.id)).toBe(0);
  });
});

describe("people of other users", () => {
  it("are not overdue for someone else: the list and the count are of own people only", async () => {
    const other = await insertUser("other@example.com");
    for (const name of ["Анна", "Борис", "Вера"]) {
      await personWithNote(name, "week", daysAgo(30));
    }

    expect(await listOverdueContacts(owner.id)).toHaveLength(3);
    expect(await countOverdueContacts(owner.id)).toBe(3);
    expect(await listOverdueContacts(other.id)).toEqual([]);
    expect(await countOverdueContacts(other.id)).toBe(0);
  });

  it("do not tell someone else that anybody has a frequency", async () => {
    const other = await insertUser("other@example.com");
    await personWithNote("Анна", "month", daysAgo(1));

    expect(await hasAnyTouchFrequency(owner.id)).toBe(true);
    expect(await hasAnyTouchFrequency(other.id)).toBe(false);
  });

  it("show their groups only from the owner's own groups", async () => {
    const other = await insertUser("other@example.com");
    const tennis = await insertGroup(owner.id, "Теннис");
    const anna = await personWithNote("Анна", "week", daysAgo(30));
    await addToGroup(anna.id, tennis.id);

    expect((await listOverdueContacts(owner.id))[0].groups).toEqual([
      { id: tennis.id, name: "Теннис" },
    ]);
    expect(await listOverdueContacts(other.id)).toEqual([]);
  });
});
