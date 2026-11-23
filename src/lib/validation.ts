import { z } from "zod";

import { touchFrequency } from "@/db/schema";
import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  NOTE_MAX_LENGTH,
  PHONE_MAX_LENGTH,
  TEXT_MAX_LENGTH,
} from "@/lib/contact-form";
import { ownerToday, parseBirthDate } from "@/lib/birth-date";
import { GROUP_NAME_MAX_LENGTH } from "@/lib/group-form";

// Empty optional fields are stored as NULL, not as empty strings.
function optionalText(maxLength: number, tooLongMessage: string) {
  return z
    .string()
    .trim()
    .max(maxLength, tooLongMessage)
    .transform((value) => (value === "" ? null : value));
}

const contactFields = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Укажите имя")
    .max(NAME_MAX_LENGTH, `Имя должно быть не длиннее ${NAME_MAX_LENGTH} символов`),
  about: optionalText(TEXT_MAX_LENGTH, `Не длиннее ${TEXT_MAX_LENGTH} символов`),
  howMet: optionalText(TEXT_MAX_LENGTH, `Не длиннее ${TEXT_MAX_LENGTH} символов`),
  phone: optionalText(
    PHONE_MAX_LENGTH,
    `Телефон должен быть не длиннее ${PHONE_MAX_LENGTH} символов`,
  ),
  email: z
    .string()
    .trim()
    .max(EMAIL_MAX_LENGTH, `Почта должна быть не длиннее ${EMAIL_MAX_LENGTH} символов`)
    .refine((value) => value === "" || z.email().safeParse(value).success, {
      message: "Проверьте адрес почты: он должен выглядеть как name@example.com",
    })
    .transform((value) => (value === "" ? null : value)),
  // The empty choice is "Не задано" and is stored as NULL.
  touchFrequency: z
    .enum(["", ...touchFrequency.enumValues] as const, { message: "Выберите вариант из списка" })
    .transform((value) => (value === "" ? null : value)),
  // Checked together as one date below; here they only have to be text.
  birthDay: z.string(),
  birthMonth: z.string(),
  birthYear: z.string(),
});

// The birthday is checked on the server by the same function the form's hints come from. Its one message goes
// under the key "birthday", next to the mistakes of other fields, not instead of them. A valid date becomes
// the three numbers of the table, all NULL when the date is empty.
export const contactSchema = contactFields
  .superRefine((fields, context) => {
    const result = parseBirthDate(
      { day: fields.birthDay, month: fields.birthMonth, year: fields.birthYear },
      ownerToday(),
    );
    if (!result.ok)
      context.addIssue({ code: "custom", message: result.message, path: ["birthday"] });
  })
  .transform(({ birthDay, birthMonth, birthYear, ...fields }, context) => {
    const result = parseBirthDate(
      { day: birthDay, month: birthMonth, year: birthYear },
      ownerToday(),
    );
    if (!result.ok) {
      context.issues.push({
        code: "custom",
        message: result.message,
        path: ["birthday"],
        input: fields,
      });
      return z.NEVER;
    }
    return { ...fields, ...result.value };
  });

export const noteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Напишите текст заметки")
    .max(NOTE_MAX_LENGTH, `Заметка должна быть не длиннее ${NOTE_MAX_LENGTH} символов`),
});

export const groupNameSchema = z
  .string()
  .trim()
  .min(1, "Укажите название группы")
  .max(GROUP_NAME_MAX_LENGTH, `Название — не длиннее ${GROUP_NAME_MAX_LENGTH} символов`);

// The email a person logs in with. Spaces around it are dropped and letters are lower-cased, so "Anna@Example.com "
// and "anna@example.com" are one user. Every failure gives the same message, as the form shows just one.
const LOGIN_EMAIL_MESSAGE = "Проверьте адрес почты";

export const loginEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, LOGIN_EMAIL_MESSAGE)
  .max(EMAIL_MAX_LENGTH, LOGIN_EMAIL_MESSAGE)
  .pipe(z.email(LOGIN_EMAIL_MESSAGE));

// Server actions are reachable by direct requests, so ids are checked even though the UI always sends a valid one.
export function isValidId(id: unknown): id is number {
  return typeof id === "number" && Number.isInteger(id) && id > 0;
}
