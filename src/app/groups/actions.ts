"use server";

import { revalidatePath } from "next/cache";

import type { ContactGroupState, DeleteGroupState, GroupFormState } from "@/lib/group-form";
import {
  CONTACT_NOT_FOUND_MESSAGE,
  GROUP_NOT_FOUND_MESSAGE,
  addContactToGroup,
  addContactToGroupByName,
  createGroup,
  deleteGroup,
  removeContactFromGroup,
  renameGroup,
} from "@/lib/groups";
import { groupNameSchema, isValidId } from "@/lib/validation";

function readName(formData: FormData): string {
  const value = formData.get("name");
  return typeof value === "string" ? value : "";
}

// Group pages, the row of labels on the home page, cards and "Пора связаться" all show groups: read them all anew.
function refreshPages() {
  revalidatePath("/", "layout");
}

export async function createGroupAction(
  _previous: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const name = readName(formData);
  const parsed = groupNameSchema.safeParse(name);
  if (!parsed.success) {
    return {
      name,
      error: parsed.error.issues[0]?.message ?? "Проверьте название группы",
      saved: false,
    };
  }

  const result = await createGroup(parsed.data);
  if (!result.ok) {
    return { name, error: result.error, saved: false };
  }

  refreshPages();
  return { name: "", error: null, saved: true };
}

export async function renameGroupAction(
  groupId: number,
  _previous: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const name = readName(formData);
  if (!isValidId(groupId)) {
    return { name, error: GROUP_NOT_FOUND_MESSAGE, saved: false };
  }

  const parsed = groupNameSchema.safeParse(name);
  if (!parsed.success) {
    return {
      name,
      error: parsed.error.issues[0]?.message ?? "Проверьте название группы",
      saved: false,
    };
  }

  const result = await renameGroup(groupId, parsed.data);
  if (!result.ok) {
    return { name, error: result.error, saved: false };
  }

  refreshPages();
  return { name: parsed.data, error: null, saved: true };
}

// The people of the group stay in contacts: only the membership goes with the group.
export async function deleteGroupAction(groupId: number): Promise<DeleteGroupState> {
  if (!isValidId(groupId)) {
    return { error: GROUP_NOT_FOUND_MESSAGE };
  }

  const result = await deleteGroup(groupId);
  if (!result.ok) {
    return { error: result.error };
  }

  refreshPages();
  return { error: null };
}

// Used by the card: pick a group from the list in "+ группа".
export async function addContactToGroupAction(
  contactId: number,
  groupId: number,
): Promise<ContactGroupState> {
  if (!isValidId(contactId)) return { error: CONTACT_NOT_FOUND_MESSAGE };
  if (!isValidId(groupId)) return { error: GROUP_NOT_FOUND_MESSAGE };

  const result = await addContactToGroup(contactId, groupId);
  if (!result.ok) return { error: result.error };

  refreshPages();
  return { error: null };
}

// Used by the card: type a name in "+ группа". A new name creates the group; an existing one (any letter case) is joined.
// `saved` tells the popup it can close; on an error it stays open with the typed text.
export async function addContactToGroupByNameAction(
  contactId: number,
  _previous: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const name = readName(formData);
  if (!isValidId(contactId)) {
    return { name, error: CONTACT_NOT_FOUND_MESSAGE, saved: false };
  }

  const parsed = groupNameSchema.safeParse(name);
  if (!parsed.success) {
    return {
      name,
      error: parsed.error.issues[0]?.message ?? "Проверьте название группы",
      saved: false,
    };
  }

  const result = await addContactToGroupByName(contactId, parsed.data);
  if (!result.ok) {
    return { name, error: result.error, saved: false };
  }

  refreshPages();
  return { name: "", error: null, saved: true };
}

// The cross on a label in the card: no question, and the group stays even if nobody is left in it.
export async function removeContactFromGroupAction(
  contactId: number,
  groupId: number,
): Promise<ContactGroupState> {
  if (!isValidId(contactId)) return { error: CONTACT_NOT_FOUND_MESSAGE };
  if (!isValidId(groupId)) return { error: GROUP_NOT_FOUND_MESSAGE };

  const result = await removeContactFromGroup(contactId, groupId);
  if (!result.ok) return { error: result.error };

  refreshPages();
  return { error: null };
}
