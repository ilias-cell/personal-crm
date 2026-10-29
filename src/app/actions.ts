"use server";

import { eq, sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ZodError } from "zod";

import { db } from "@/db";
import { contacts, notes, type TouchFrequency } from "@/db/schema";
import type {
  ContactFormField,
  ContactFormState,
  ContactFormValues,
  DeleteContactState,
  NoteFormState,
} from "@/lib/contact-form";
import { contactSchema, noteSchema } from "@/lib/validation";

const SAVE_FAILED_MESSAGE =
  "Не удалось сохранить. Проверьте, что база данных запущена, и попробуйте ещё раз.";
const DELETE_FAILED_MESSAGE =
  "Не удалось удалить. Проверьте, что база данных запущена, и попробуйте ещё раз.";
const CONTACT_NOT_FOUND_MESSAGE =
  "Этот контакт не найден. Вернитесь к списку и откройте его заново.";

function readText(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function readContactForm(formData: FormData): ContactFormValues {
  return {
    name: readText(formData, "name"),
    about: readText(formData, "about"),
    howMet: readText(formData, "howMet"),
    phone: readText(formData, "phone"),
    email: readText(formData, "email"),
    touchFrequency: readText(formData, "touchFrequency"),
  };
}

function toFieldErrors(error: ZodError): ContactFormState["fieldErrors"] {
  const fieldErrors: ContactFormState["fieldErrors"] = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as ContactFormField;
    // Keep the first message per field: one clear hint is enough.
    fieldErrors[field] ??= issue.message;
  }
  return fieldErrors;
}

// Server actions are reachable by direct requests, so the id is checked even though the UI always sends a valid one.
function isValidId(id: unknown): id is number {
  return typeof id === "number" && Number.isInteger(id) && id > 0;
}

// The keep-in-touch period runs from the last note or from touch_restarted_at, whichever is later.
// Saving a frequency restarts it when the frequency changes to another value, or when it is set
// on a contact without notes; set on a contact with notes, it counts from the last note.
// Inside SET, PostgreSQL still sees the row as it was before the update, so the old frequency is readable here.
function touchRestartedAtOnSave(newFrequency: TouchFrequency | null): SQL {
  if (newFrequency === null) return sql`null`;
  return sql`case
    when ${contacts.touchFrequency} = ${newFrequency} then ${contacts.touchRestartedAt}
    when ${contacts.touchFrequency} is null
      and exists (select 1 from ${notes} where ${notes.contactId} = ${contacts.id}) then null
    else now()
  end`;
}

export async function createContact(
  _previous: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const values = readContactForm(formData);
  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) {
    return { values, fieldErrors: toFieldErrors(parsed.error), formError: null };
  }

  try {
    await db.insert(contacts).values({
      ...parsed.data,
      // A new contact has no notes yet, so a chosen frequency starts its period today.
      touchRestartedAt: parsed.data.touchFrequency ? sql`now()` : null,
    });
  } catch (error) {
    console.error("Failed to create contact", error);
    return { values, fieldErrors: {}, formError: SAVE_FAILED_MESSAGE };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function updateContact(
  contactId: number,
  _previous: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const values = readContactForm(formData);
  if (!isValidId(contactId)) {
    return { values, fieldErrors: {}, formError: CONTACT_NOT_FOUND_MESSAGE };
  }

  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) {
    return { values, fieldErrors: toFieldErrors(parsed.error), formError: null };
  }

  let updatedRows: { id: number }[];
  try {
    updatedRows = await db
      .update(contacts)
      .set({
        ...parsed.data,
        touchRestartedAt: touchRestartedAtOnSave(parsed.data.touchFrequency),
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, contactId))
      .returning({ id: contacts.id });
  } catch (error) {
    console.error("Failed to update contact", error);
    return { values, fieldErrors: {}, formError: SAVE_FAILED_MESSAGE };
  }
  if (updatedRows.length === 0) {
    return { values, fieldErrors: {}, formError: CONTACT_NOT_FOUND_MESSAGE };
  }

  revalidatePath("/", "layout");
  redirect(`/contacts/${contactId}`);
}

// The contact's notes go with it: notes.contact_id is declared ON DELETE CASCADE.
export async function deleteContact(contactId: number): Promise<DeleteContactState> {
  if (!isValidId(contactId)) {
    return { error: CONTACT_NOT_FOUND_MESSAGE };
  }

  let deletedRows: { id: number }[];
  try {
    deletedRows = await db.delete(contacts).where(eq(contacts.id, contactId)).returning({ id: contacts.id });
  } catch (error) {
    console.error("Failed to delete contact", error);
    return { error: DELETE_FAILED_MESSAGE };
  }
  // Nothing deleted: the contact is already gone, for example deleted in another tab.
  if (deletedRows.length === 0) {
    return { error: CONTACT_NOT_FOUND_MESSAGE };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function addNote(
  contactId: number,
  _previous: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const body = readText(formData, "body");
  if (!isValidId(contactId)) {
    return { body, error: CONTACT_NOT_FOUND_MESSAGE };
  }

  const parsed = noteSchema.safeParse({ body });
  if (!parsed.success) {
    return { body, error: parsed.error.issues[0]?.message ?? "Проверьте текст заметки" };
  }

  try {
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1);
    if (!contact) {
      return { body, error: CONTACT_NOT_FOUND_MESSAGE };
    }
    await db.insert(notes).values({ contactId, body: parsed.data.body });
  } catch (error) {
    console.error("Failed to add note", error);
    return { body, error: SAVE_FAILED_MESSAGE };
  }

  // Re-renders the open card, so the new note shows up in the feed right away, and drops the pages
  // the browser keeps: going Back to "Пора связаться" or the home page shows them without this person.
  revalidatePath("/", "layout");
  return { body: "", error: null };
}
