"use server";

import { eq } from "drizzle-orm";
import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ZodError } from "zod";

import { db } from "@/db";
import { contacts, notes } from "@/db/schema";
import type {
  ContactFormField,
  ContactFormState,
  ContactFormValues,
  NoteFormState,
} from "@/lib/contact-form";
import { contactSchema, noteSchema } from "@/lib/validation";

const SAVE_FAILED_MESSAGE =
  "Не удалось сохранить. Проверьте, что база данных запущена, и попробуйте ещё раз.";
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
    await db.insert(contacts).values(parsed.data);
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
      .set({ ...parsed.data, updatedAt: new Date() })
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

  // Re-render the open card so the new note shows up in the feed right away.
  refresh();
  return { body: "", error: null };
}
