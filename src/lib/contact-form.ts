// Shared between the forms (browser) and the server actions, so it must stay free of server-only code.

import type { TouchFrequency } from "@/db/schema";

export const NAME_MAX_LENGTH = 120;
export const TEXT_MAX_LENGTH = 200;
export const PHONE_MAX_LENGTH = 40;
export const EMAIL_MAX_LENGTH = 254;
export const NOTE_MAX_LENGTH = 5000;

// In the order the form lists them. The Record type keeps this in step with the database enum.
export const TOUCH_FREQUENCY_LABELS: Record<TouchFrequency, string> = {
  week: "Раз в неделю",
  month: "Раз в месяц",
  quarter: "Раз в квартал",
  year: "Раз в год",
};

export type ContactFormValues = {
  name: string;
  about: string;
  howMet: string;
  phone: string;
  email: string;
  // A TouchFrequency value, or "" for "Не задано".
  touchFrequency: string;
};

export type ContactFormField = keyof ContactFormValues;

export type ContactFormState = {
  // What the user typed, returned back so a failed submit does not wipe the form.
  values: ContactFormValues | null;
  fieldErrors: Partial<Record<ContactFormField, string>>;
  formError: string | null;
};

export const initialContactFormState: ContactFormState = {
  values: null,
  fieldErrors: {},
  formError: null,
};

export type NoteFormState = {
  body: string;
  error: string | null;
};

export const initialNoteFormState: NoteFormState = {
  body: "",
  error: null,
};

export type DeleteContactState = {
  error: string | null;
};

export const initialDeleteContactState: DeleteContactState = {
  error: null,
};
