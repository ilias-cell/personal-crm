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
import { addToGroup, insertContact, insertGroup } from "@/test/factories";

// The only thing replaced: refreshing pages needs a running Next.js.
const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath }));

function form(name: string): FormData {
  const formData = new FormData();
  formData.set("name", name);
  return formData;
}

async function groupNames(): Promise<string[]> {
  return (await listGroups()).map((group) => group.name);
}

beforeEach(() => {
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
    await insertGroup("Семья");

    const state = await createGroupAction(initialGroupFormState, form("семья"));

    expect(state).toEqual({ name: "семья", error: "Группа «Семья» уже есть", saved: false });
    expect(await groupNames()).toEqual(["Семья"]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("renameGroupAction", () => {
  it("renames the group and refreshes the pages", async () => {
    const tennis = await insertGroup("Теннис");

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
    await insertGroup("Семья");
    const tennis = await insertGroup("Теннис");

    const state = await renameGroupAction(tennis.id, initialGroupFormState, form("семья"));

    expect(state).toEqual({ name: "семья", error: "Группа «Семья» уже есть", saved: false });
    expect(await groupNames()).toEqual(["Семья", "Теннис"]);
  });

  it("gives back the typed text with the error when the name is too long", async () => {
    const tennis = await insertGroup("Теннис");
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
    const tennis = await insertGroup("Теннис");

    expect(await deleteGroupAction(tennis.id)).toEqual({ error: null });

    expect(await groupNames()).toEqual([]);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("says the group is gone when it was already deleted", async () => {
    const tennis = await insertGroup("Теннис");
    await deleteGroupAction(tennis.id);

    expect(await deleteGroupAction(tennis.id)).toEqual({
      error: "Этой группы уже нет. Обновите страницу.",
    });
  });
});

describe("addContactToGroupAction", () => {
  it("puts the person in the group and refreshes the pages", async () => {
    const anna = await insertContact("Анна");
    const family = await insertGroup("Семья");

    expect(await addContactToGroupAction(anna.id, family.id)).toEqual({ error: null });

    expect((await listContactGroups(anna.id)).map((group) => group.name)).toEqual(["Семья"]);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("says the group is gone when it was deleted in another tab", async () => {
    const anna = await insertContact("Анна");

    expect(await addContactToGroupAction(anna.id, 999)).toEqual({
      error: "Этой группы уже нет. Обновите страницу.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("says the contact is not found for a number that is not a contact", async () => {
    const family = await insertGroup("Семья");

    for (const id of [999, 0, -1]) {
      const state = await addContactToGroupAction(id, family.id);
      expect(state.error).toBe("Этот контакт не найден. Вернитесь к списку и откройте его заново.");
    }
  });
});

describe("addContactToGroupByNameAction", () => {
  it("creates the group, puts the person in it and reports success", async () => {
    const anna = await insertContact("Анна");

    const state = await addContactToGroupByNameAction(
      anna.id,
      initialGroupFormState,
      form("  Йога "),
    );

    expect(state).toEqual({ name: "", error: null, saved: true });
    expect((await listContactGroups(anna.id)).map((group) => group.name)).toEqual(["Йога"]);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("puts the person in the existing group named in other letter case", async () => {
    const anna = await insertContact("Анна");
    await insertGroup("Семья");

    const state = await addContactToGroupByNameAction(
      anna.id,
      initialGroupFormState,
      form("семья"),
    );

    expect(state.saved).toBe(true);
    expect((await listContactGroups(anna.id)).map((group) => group.name)).toEqual(["Семья"]);
    expect((await listGroups()).map((group) => group.name)).toEqual(["Семья"]);
  });

  it("reports success and changes nothing for a person who is already in the group", async () => {
    const anna = await insertContact("Анна");
    const tennis = await insertGroup("Теннис");
    await addToGroup(anna.id, tennis.id);

    const state = await addContactToGroupByNameAction(
      anna.id,
      initialGroupFormState,
      form("теннис"),
    );

    expect(state.saved).toBe(true);
    expect((await listContactGroups(anna.id)).map((group) => group.name)).toEqual(["Теннис"]);
  });

  it("does not report success for an empty name, so the popup stays open", async () => {
    const anna = await insertContact("Анна");

    const state = await addContactToGroupByNameAction(anna.id, initialGroupFormState, form(""));

    expect(state).toEqual({ name: "", error: "Укажите название группы", saved: false });
    expect(await listGroups()).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does not report success for a name that is too long", async () => {
    const anna = await insertContact("Анна");

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
    expect(await listGroups()).toEqual([]);
  });
});

describe("removeContactFromGroupAction", () => {
  it("takes the person out of the group and refreshes the pages", async () => {
    const anna = await insertContact("Анна");
    const family = await insertGroup("Семья");
    const tennis = await insertGroup("Теннис");
    await addToGroup(anna.id, family.id);
    await addToGroup(anna.id, tennis.id);

    expect(await removeContactFromGroupAction(anna.id, tennis.id)).toEqual({ error: null });

    expect((await listContactGroups(anna.id)).map((group) => group.name)).toEqual(["Семья"]);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("rejects numbers that are not a contact or a group", async () => {
    const state = await removeContactFromGroupAction(0, -5);

    expect(state.error).not.toBeNull();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
