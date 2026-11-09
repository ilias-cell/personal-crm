import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { addNote, createContact, deleteContact, updateContact } from "@/app/actions";
import { db } from "@/db";
import { contacts, notes, type Contact, type TouchFrequency, type User } from "@/db/schema";
import { initialContactFormState, initialNoteFormState } from "@/lib/contact-form";
import { countOverdueContacts, listOverdueContacts } from "@/lib/keep-in-touch";
import { signInAs, uniqueEmail } from "@/test/auth";
import { insertContact, insertUser } from "@/test/factories";

// The only things replaced: refreshing pages, redirecting and the request headers need a running Next.js.
// The actions run as a real login: the headers carry the cookie of a session made through the email link.
const { revalidatePath, redirect, requestHeaders } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  requestHeaders: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/headers")>()),
  headers: requestHeaders,
}));

// Redirecting stops the code in Next.js by throwing; the mock does the same when a test needs to see where it went.
function redirectThrows() {
  redirect.mockImplementation((url: string) => {
    throw new Error(`redirect to ${url}`);
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

function daysLater(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

// The contact form as the browser sends it. "" in touchFrequency is «Не задано».
function contactForm(name: string, touchFrequency: TouchFrequency | "", phone = ""): FormData {
  const formData = new FormData();
  formData.set("name", name);
  formData.set("about", "");
  formData.set("howMet", "");
  formData.set("phone", phone);
  formData.set("email", "");
  formData.set("touchFrequency", touchFrequency);
  return formData;
}

async function create(name: string, touchFrequency: TouchFrequency | ""): Promise<Contact> {
  await createContact(initialContactFormState, contactForm(name, touchFrequency));
  const [contact] = await db.select().from(contacts).where(eq(contacts.name, name));
  return contact;
}

async function saveFrequency(contact: Contact, touchFrequency: TouchFrequency | "", phone = "") {
  const state = await updateContact(
    contact.id,
    initialContactFormState,
    contactForm(contact.name, touchFrequency, phone),
  );
  // A successful save redirects to the card and returns nothing.
  expect(state).toBeUndefined();
}

async function reload(contact: Contact): Promise<Contact> {
  const [fresh] = await db.select().from(contacts).where(eq(contacts.id, contact.id));
  return fresh;
}

async function addNoteDaysAgo(contactId: number, days: number) {
  await db.insert(notes).values({ contactId, body: "Поговорили", createdAt: daysAgo(days) });
}

async function overdueNames(asOf?: Date): Promise<string[]> {
  return (await listOverdueContacts(owner.id, { asOf })).map((person) => person.name);
}

// The day the period was started over by the save, as the database stored it.
async function restartedAt(contact: Contact): Promise<Date> {
  const { touchRestartedAt } = await reload(contact);
  expect(touchRestartedAt).not.toBeNull();
  return touchRestartedAt!;
}

// The user whose data a test works with, logged in; every test starts with its own, because the tables are emptied.
let owner: User;

beforeEach(async () => {
  revalidatePath.mockClear();
  redirect.mockReset();
  const session = await signInAs(uniqueEmail("owner"));
  owner = session.user;
  requestHeaders.mockResolvedValue(session.headers);
});

describe("the frequency in the contact form", () => {
  it("is saved with a new contact", async () => {
    const anna = await create("Анна", "month");

    expect(anna.touchFrequency).toBe("month");
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("is not required: a new contact without it is saved with no frequency", async () => {
    const anna = await create("Анна", "");

    expect(anna).toMatchObject({ name: "Анна", touchFrequency: null });
  });

  it("is changed when editing", async () => {
    const anna = await create("Анна", "month");

    await saveFrequency(anna, "year");

    expect((await reload(anna)).touchFrequency).toBe("year");
    expect(redirect).toHaveBeenCalledWith(`/contacts/${anna.id}`);
  });

  it("is removed by «Не задано»", async () => {
    const anna = await create("Анна", "month");

    await saveFrequency(anna, "");

    expect((await reload(anna)).touchFrequency).toBeNull();
  });

  it("accepts only the listed choices", async () => {
    const state = await createContact(initialContactFormState, contactForm("Анна", "day" as never));

    expect(state.fieldErrors.touchFrequency).toBe("Выберите вариант из списка");
    expect(await db.select().from(contacts)).toEqual([]);
  });
});

describe("a frequency given to a person without notes", () => {
  it("keeps a new contact off the page until the period ends", async () => {
    const anna = await create("Анна", "week");
    const added = await restartedAt(anna);

    expect(await overdueNames()).toEqual([]);
    expect(await overdueNames(daysLater(added, 6))).toEqual([]);
    expect(await overdueNames(daysLater(added, 7))).toEqual(["Анна"]);
  });

  it("counts from the day it is given to a contact added long ago", async () => {
    const anna = await insertContact(owner.id, "Анна", { createdAt: daysAgo(183) });

    await saveFrequency(anna, "month");
    const given = await restartedAt(anna);

    expect(await overdueNames()).toEqual([]);
    // A month is 28 to 31 days, whichever month it is.
    expect(await overdueNames(daysLater(given, 27))).toEqual([]);
    expect(await overdueNames(daysLater(given, 31))).toEqual(["Анна"]);
  });
});

describe("a frequency given to a person with old notes", () => {
  it("shows the person at once when the last note is older than the period", async () => {
    const anna = await insertContact(owner.id, "Анна");
    await addNoteDaysAgo(anna.id, 365);

    await saveFrequency(anna, "month");

    const [person] = await listOverdueContacts(owner.id);
    expect(person.name).toBe("Анна");
    expect(person.overdueDays).toBeGreaterThan(300);
  });

  it("counts from the last note when the period has not ended yet", async () => {
    const anna = await insertContact(owner.id, "Анна");
    await addNoteDaysAgo(anna.id, 3);

    await saveFrequency(anna, "week");

    expect(await overdueNames()).toEqual([]);
    expect(await overdueNames(daysLater(new Date(), 3))).toEqual([]);
    expect(await overdueNames(daysLater(new Date(), 4))).toEqual(["Анна"]);
  });
});

describe("a change of the frequency", () => {
  it("starts the period over from the day of the change, notes or not", async () => {
    const anna = await insertContact(owner.id, "Анна", {
      touchFrequency: "month",
      touchRestartedAt: daysAgo(40),
    });
    await addNoteDaysAgo(anna.id, 20);

    await saveFrequency(anna, "week");
    const changed = await restartedAt(anna);

    expect(await overdueNames()).toEqual([]);
    expect(await overdueNames(daysLater(changed, 6))).toEqual([]);
    expect(await overdueNames(daysLater(changed, 7))).toEqual(["Анна"]);
  });

  it("takes an overdue person off the page, whatever the new frequency", async () => {
    for (const touchFrequency of ["month", "quarter", "year"] as const) {
      const person = await insertContact(owner.id, `Анна ${touchFrequency}`, {
        touchFrequency: "week",
      });
      await addNoteDaysAgo(person.id, 400);
      expect(await overdueNames()).toEqual([person.name]);

      await saveFrequency(person, touchFrequency);

      expect(await overdueNames()).toEqual([]);
    }
  });

  it("changes nothing when the form is saved with the same frequency", async () => {
    const anna = await insertContact(owner.id, "Анна", {
      touchFrequency: "week",
      touchRestartedAt: daysAgo(10),
    });
    const [before] = await listOverdueContacts(owner.id);

    await saveFrequency(anna, "week", "+7 900 000-00-00");

    expect((await reload(anna)).phone).toBe("+7 900 000-00-00");
    expect(await listOverdueContacts(owner.id)).toEqual([before]);
  });
});

describe("a frequency removed", () => {
  it("takes the person off the page", async () => {
    const anna = await insertContact(owner.id, "Анна", { touchFrequency: "week" });
    await addNoteDaysAgo(anna.id, 30);
    expect(await overdueNames()).toEqual(["Анна"]);

    await saveFrequency(anna, "");

    expect(await overdueNames()).toEqual([]);
  });

  it("counts like the first time when given again: from the last note", async () => {
    const anna = await insertContact(owner.id, "Анна", { touchFrequency: "year" });
    await addNoteDaysAgo(anna.id, 365);

    await saveFrequency(anna, "");
    await saveFrequency(anna, "month");

    expect(await overdueNames()).toEqual(["Анна"]);
  });
});

describe("a note", () => {
  it("takes the person off the page and the number on the home page down by one", async () => {
    const anna = await insertContact(owner.id, "Анна", { touchFrequency: "week" });
    await addNoteDaysAgo(anna.id, 30);
    await insertContact(owner.id, "Борис", {
      touchFrequency: "week",
      touchRestartedAt: daysAgo(10),
    });
    expect(await countOverdueContacts(owner.id)).toBe(2);

    const body = new FormData();
    body.set("body", "Созвонились");
    const state = await addNote(anna.id, initialNoteFormState, body);

    expect(state).toEqual({ body: "", error: null });
    expect(await overdueNames()).toEqual(["Борис"]);
    expect(await countOverdueContacts(owner.id)).toBe(1);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});

const CONTACT_NOT_FOUND = "Этот контакт не найден. Вернитесь к списку и откройте его заново.";

describe("contacts of other users", () => {
  async function contactOfSomeoneElse(): Promise<Contact> {
    const other = await insertUser("other@example.com");
    return insertContact(other.id, "Вера Климова");
  }

  it("cannot be changed: the server says the contact is not found and nothing changes", async () => {
    const foreign = await contactOfSomeoneElse();

    const state = await updateContact(
      foreign.id,
      initialContactFormState,
      contactForm("Другое имя", "week", "+7 000"),
    );

    expect(state?.formError).toBe(CONTACT_NOT_FOUND);
    const after = await reload(foreign);
    expect(after.name).toBe("Вера Климова");
    expect(after.touchFrequency).toBeNull();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("cannot be deleted: the server says the contact is not found and the contact stays", async () => {
    const foreign = await contactOfSomeoneElse();

    expect(await deleteContact(foreign.id)).toEqual({ error: CONTACT_NOT_FOUND });

    expect((await reload(foreign)).name).toBe("Вера Климова");
  });

  it("cannot get a note: the server says the contact is not found and no note is added", async () => {
    const foreign = await contactOfSomeoneElse();
    const formData = new FormData();
    formData.set("body", "Привет");

    const state = await addNote(foreign.id, initialNoteFormState, formData);

    expect(state.error).toBe(CONTACT_NOT_FOUND);
    expect(await db.select().from(notes)).toEqual([]);
  });

  it("answer the same as a contact that does not exist", async () => {
    const foreign = await contactOfSomeoneElse();
    const formData = new FormData();
    formData.set("body", "Привет");

    const ofSomeoneElse = await addNote(foreign.id, initialNoteFormState, formData);
    const missing = await addNote(999999, initialNoteFormState, formData);

    expect(ofSomeoneElse).toEqual(missing);
  });

  it("are not created for someone else: a new contact belongs to the logged-in user", async () => {
    const created = await create("Анна", "");

    expect(created.ownerId).toBe(owner.id);
  });
});

describe("without a login", () => {
  it("every action goes to the login page and changes nothing", async () => {
    const anna = await insertContact(owner.id, "Анна");
    const noteForm = new FormData();
    noteForm.set("body", "Привет");
    requestHeaders.mockResolvedValue(new Headers());
    redirectThrows();

    await expect(createContact(initialContactFormState, contactForm("Борис", ""))).rejects.toThrow(
      "redirect to /login",
    );
    await expect(
      updateContact(anna.id, initialContactFormState, contactForm("Другое имя", "")),
    ).rejects.toThrow("redirect to /login");
    await expect(deleteContact(anna.id)).rejects.toThrow("redirect to /login");
    await expect(addNote(anna.id, initialNoteFormState, noteForm)).rejects.toThrow(
      "redirect to /login",
    );

    expect((await db.select().from(contacts)).map((contact) => contact.name)).toEqual(["Анна"]);
    expect(await db.select().from(notes)).toEqual([]);
  });
});
