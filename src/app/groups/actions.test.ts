import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addContactToGroupAction,
  addContactToGroupByNameAction,
  createGroupAction,
  deleteGroupAction,
  removeContactFromGroupAction,
  renameGroupAction,
} from "@/app/groups/actions";
import { initialGroupFormState } from "@/lib/group-form";
import { listContactGroups, listGroups } from "@/lib/groups";
import { db } from "@/db";
import type { User } from "@/db/schema";
import { signInAs, uniqueEmail } from "@/test/auth";
import { addToGroup, insertContact, insertGroup, insertUser } from "@/test/factories";

// The only things replaced: refreshing pages, redirecting and the request headers need a running Next.js.
// The actions run as a real login: the headers carry the cookie of a session made through the email link.
const { revalidatePath, requestHeaders } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  requestHeaders: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
// Redirecting stops the code in Next.js by throwing, and so does this.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect to ${url}`);
  },
}));
vi.mock("next/headers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/headers")>()),
  headers: requestHeaders,
}));

function form(name: string): FormData {
  const formData = new FormData();
  formData.set("name", name);
  return formData;
}

// The group names of a contact, whoever owns it (read straight from the database, not through the app).
async function listContactGroupsOf(contactId: number): Promise<string[]> {
  const { rows } = await db.execute<{ name: string }>(
    sql`select g.name from contact_groups cg join groups g on g.id = cg.group_id where cg.contact_id = ${contactId}`,
  );
  return rows.map((row) => row.name);
}

async function groupNames(): Promise<string[]> {
  return (await listGroups(owner.id)).map((group) => group.name);
}

// The user whose data a test works with, logged in; every test starts with its own, because the tables are emptied.
let owner: User;

beforeEach(async () => {
  const session = await signInAs(uniqueEmail("owner"));
  owner = session.user;
  requestHeaders.mockResolvedValue(session.headers);
  revalidatePath.mockClear();
});

describe("createGroupAction", () => {
  it("creates the group, clears the field and refreshes the pages", async () => {
    const state = await createGroupAction(initialGroupFormState, form("  Теннис  "));

    expect(state).toEqual({ name: "", error: null, saved: true });
    expect(await groupNames()).toEqual(["Теннис"]);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("asks for a name when the field is empty or has spaces only", async () => {
    for (const text of ["", "   "]) {
      const state = await createGroupAction(initialGroupFormState, form(text));
      expect(state).toEqual({ name: text, error: "Укажите название группы", saved: false });
    }
    expect(await groupNames()).toEqual([]);
  });

  it("gives back the typed text with the error when the name is too long", async () => {
    const tooLong = "а".repeat(41);

    const state = await createGroupAction(initialGroupFormState, form(tooLong));

    expect(state).toEqual({
      name: tooLong,
      error: "Название — не длиннее 40 символов",
      saved: false,
    });
    expect(await groupNames()).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("gives back the typed text with the error when the name is taken", async () => {
    await insertGroup(owner.id, "Семья");

    const state = await createGroupAction(initialGroupFormState, form("семья"));

    expect(state).toEqual({ name: "семья", error: "Группа «Семья» уже есть", saved: false });
    expect(await groupNames()).toEqual(["Семья"]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("renameGroupAction", () => {
  it("renames the group and refreshes the pages", async () => {
    const tennis = await insertGroup(owner.id, "Теннис");

    const state = await renameGroupAction(
      tennis.id,
      initialGroupFormState,
      form("Теннис по средам"),
    );

    expect(state).toEqual({ name: "Теннис по средам", error: null, saved: true });
    expect(await groupNames()).toEqual(["Теннис по средам"]);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("gives back the typed text with the error when another group has the name", async () => {
    await insertGroup(owner.id, "Семья");
    const tennis = await insertGroup(owner.id, "Теннис");

    const state = await renameGroupAction(tennis.id, initialGroupFormState, form("семья"));

    expect(state).toEqual({ name: "семья", error: "Группа «Семья» уже есть", saved: false });
    expect(await groupNames()).toEqual(["Семья", "Теннис"]);
  });

  it("gives back the typed text with the error when the name is too long", async () => {
    const tennis = await insertGroup(owner.id, "Теннис");
    const tooLong = "а".repeat(41);

    const state = await renameGroupAction(tennis.id, initialGroupFormState, form(tooLong));

    expect(state).toEqual({
      name: tooLong,
      error: "Название — не длиннее 40 символов",
      saved: false,
    });
  });

  it("says the group is gone for a number that is not a group", async () => {
    for (const id of [999, 0, -1, 1.5]) {
      const state = await renameGroupAction(id, initialGroupFormState, form("Теннис"));
      expect(state.error).toBe("Этой группы уже нет. Обновите страницу.");
    }
  });
});

describe("deleteGroupAction", () => {
  it("deletes the group and refreshes the pages", async () => {
    const tennis = await insertGroup(owner.id, "Теннис");

    expect(await deleteGroupAction(tennis.id)).toEqual({ error: null });

    expect(await groupNames()).toEqual([]);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("says the group is gone when it was already deleted", async () => {
    const tennis = await insertGroup(owner.id, "Теннис");
    await deleteGroupAction(tennis.id);

    expect(await deleteGroupAction(tennis.id)).toEqual({
      error: "Этой группы уже нет. Обновите страницу.",
    });
  });
});

describe("addContactToGroupAction", () => {
  it("puts the person in the group and refreshes the pages", async () => {
    const anna = await insertContact(owner.id, "Анна");
    const family = await insertGroup(owner.id, "Семья");

    expect(await addContactToGroupAction(anna.id, family.id)).toEqual({ error: null });

    expect((await listContactGroups(owner.id, anna.id)).map((group) => group.name)).toEqual([
      "Семья",
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("says the group is gone when it was deleted in another tab", async () => {
    const anna = await insertContact(owner.id, "Анна");

    expect(await addContactToGroupAction(anna.id, 999)).toEqual({
      error: "Этой группы уже нет. Обновите страницу.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("says the contact is not found for a number that is not a contact", async () => {
    const family = await insertGroup(owner.id, "Семья");

    for (const id of [999, 0, -1]) {
      const state = await addContactToGroupAction(id, family.id);
      expect(state.error).toBe("Этот контакт не найден. Вернитесь к списку и откройте его заново.");
    }
  });
});

describe("addContactToGroupByNameAction", () => {
  it("creates the group, puts the person in it and reports success", async () => {
    const anna = await insertContact(owner.id, "Анна");

    const state = await addContactToGroupByNameAction(
      anna.id,
      initialGroupFormState,
      form("  Йога "),
    );

    expect(state).toEqual({ name: "", error: null, saved: true });
    expect((await listContactGroups(owner.id, anna.id)).map((group) => group.name)).toEqual([
      "Йога",
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("puts the person in the existing group named in other letter case", async () => {
    const anna = await insertContact(owner.id, "Анна");
    await insertGroup(owner.id, "Семья");

    const state = await addContactToGroupByNameAction(
      anna.id,
      initialGroupFormState,
      form("семья"),
    );

    expect(state.saved).toBe(true);
    expect((await listContactGroups(owner.id, anna.id)).map((group) => group.name)).toEqual([
      "Семья",
    ]);
    expect((await listGroups(owner.id)).map((group) => group.name)).toEqual(["Семья"]);
  });

  it("reports success and changes nothing for a person who is already in the group", async () => {
    const anna = await insertContact(owner.id, "Анна");
    const tennis = await insertGroup(owner.id, "Теннис");
    await addToGroup(anna.id, tennis.id);

    const state = await addContactToGroupByNameAction(
      anna.id,
      initialGroupFormState,
      form("теннис"),
    );

    expect(state.saved).toBe(true);
    expect((await listContactGroups(owner.id, anna.id)).map((group) => group.name)).toEqual([
      "Теннис",
    ]);
  });

  it("does not report success for an empty name, so the popup stays open", async () => {
    const anna = await insertContact(owner.id, "Анна");

    const state = await addContactToGroupByNameAction(anna.id, initialGroupFormState, form(""));

    expect(state).toEqual({ name: "", error: "Укажите название группы", saved: false });
    expect(await listGroups(owner.id)).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does not report success for a name that is too long", async () => {
    const anna = await insertContact(owner.id, "Анна");

    const state = await addContactToGroupByNameAction(
      anna.id,
      initialGroupFormState,
      form("а".repeat(41)),
    );

    expect(state.saved).toBe(false);
    expect(state.error).toBe("Название — не длиннее 40 символов");
  });

  it("says the contact is not found when it was deleted in another tab", async () => {
    const state = await addContactToGroupByNameAction(999, initialGroupFormState, form("Йога"));

    expect(state).toEqual({
      name: "Йога",
      error: "Этот контакт не найден. Вернитесь к списку и откройте его заново.",
      saved: false,
    });
    expect(await listGroups(owner.id)).toEqual([]);
  });
});

describe("removeContactFromGroupAction", () => {
  it("takes the person out of the group and refreshes the pages", async () => {
    const anna = await insertContact(owner.id, "Анна");
    const family = await insertGroup(owner.id, "Семья");
    const tennis = await insertGroup(owner.id, "Теннис");
    await addToGroup(anna.id, family.id);
    await addToGroup(anna.id, tennis.id);

    expect(await removeContactFromGroupAction(anna.id, tennis.id)).toEqual({ error: null });

    expect((await listContactGroups(owner.id, anna.id)).map((group) => group.name)).toEqual([
      "Семья",
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("rejects numbers that are not a contact or a group", async () => {
    const state = await removeContactFromGroupAction(0, -5);

    expect(state.error).not.toBeNull();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

const CONTACT_NOT_FOUND = "Этот контакт не найден. Вернитесь к списку и откройте его заново.";
const GROUP_NOT_FOUND = "Этой группы уже нет. Обновите страницу.";

describe("groups and contacts of other users", () => {
  async function someoneElse() {
    const other = await insertUser("other@example.com");
    const group = await insertGroup(other.id, "Теннис");
    const contact = await insertContact(other.id, "Борис");
    await addToGroup(contact.id, group.id);
    return { other, group, contact };
  }

  it("cannot rename or delete a group of someone else", async () => {
    const { other, group } = await someoneElse();

    expect(
      await renameGroupAction(group.id, { name: "", error: null, saved: false }, form("Чужая")),
    ).toMatchObject({
      error: GROUP_NOT_FOUND,
      saved: false,
    });
    expect(await deleteGroupAction(group.id)).toEqual({ error: GROUP_NOT_FOUND });

    expect((await listGroups(other.id)).map((found) => found.name)).toEqual(["Теннис"]);
  });

  it("cannot put an own contact into a group of someone else", async () => {
    const { other, group } = await someoneElse();
    const mine = await insertContact(owner.id, "Анна");

    expect(await addContactToGroupAction(mine.id, group.id)).toEqual({ error: GROUP_NOT_FOUND });

    expect(await listContactGroups(owner.id, mine.id)).toEqual([]);
    expect(other.id).toBeDefined();
  });

  it("cannot put a contact of someone else into an own group", async () => {
    const { contact } = await someoneElse();
    const mineGroup = await insertGroup(owner.id, "Семья");

    expect(await addContactToGroupAction(contact.id, mineGroup.id)).toEqual({
      error: CONTACT_NOT_FOUND,
    });
    expect(
      await addContactToGroupByNameAction(
        contact.id,
        { name: "", error: null, saved: false },
        form("Семья"),
      ),
    ).toMatchObject({ error: CONTACT_NOT_FOUND, saved: false });

    expect(await listContactGroupsOf(contact.id)).toEqual(["Теннис"]);
  });

  it("cannot take a contact of someone else out of their group", async () => {
    const { group, contact } = await someoneElse();

    expect(await removeContactFromGroupAction(contact.id, group.id)).toEqual({
      error: CONTACT_NOT_FOUND,
    });

    expect(await listContactGroupsOf(contact.id)).toEqual(["Теннис"]);
  });

  it("creates a group of the logged-in user, even when someone else has one with this name", async () => {
    await someoneElse();

    const state = await createGroupAction({ name: "", error: null, saved: false }, form("Теннис"));

    expect(state.saved).toBe(true);
    expect(await groupNames()).toEqual(["Теннис"]);
  });
});

describe("without a login", () => {
  it("every action goes to the login page and changes nothing", async () => {
    const anna = await insertContact(owner.id, "Анна");
    const family = await insertGroup(owner.id, "Семья");
    requestHeaders.mockResolvedValue(new Headers());
    const empty = { name: "", error: null, saved: false };

    await expect(createGroupAction(empty, form("Теннис"))).rejects.toThrow("redirect to /login");
    await expect(renameGroupAction(family.id, empty, form("Другая"))).rejects.toThrow(
      "redirect to /login",
    );
    await expect(deleteGroupAction(family.id)).rejects.toThrow("redirect to /login");
    await expect(addContactToGroupAction(anna.id, family.id)).rejects.toThrow("redirect to /login");
    await expect(addContactToGroupByNameAction(anna.id, empty, form("Йога"))).rejects.toThrow(
      "redirect to /login",
    );
    await expect(removeContactFromGroupAction(anna.id, family.id)).rejects.toThrow(
      "redirect to /login",
    );

    expect(await groupNames()).toEqual(["Семья"]);
    expect(await listContactGroups(owner.id, anna.id)).toEqual([]);
  });
});
