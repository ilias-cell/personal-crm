import { z } from "zod";

import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  NOTE_MAX_LENGTH,
  PHONE_MAX_LENGTH,
  TEXT_MAX_LENGTH,
} from "@/lib/contact-form";

// Empty optional fields are stored as NULL, not as empty strings.
function optionalText(maxLength: number, tooLongMessage: string) {
  return z
    .string()
    .trim()
    .max(maxLength, tooLongMessage)
    .transform((value) => (value === "" ? null : value));
}

export const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Укажите имя")
    .max(NAME_MAX_LENGTH, `Имя должно быть не длиннее ${NAME_MAX_LENGTH} символов`),
  about: optionalText(TEXT_MAX_LENGTH, `Не длиннее ${TEXT_MAX_LENGTH} символов`),
  howMet: optionalText(TEXT_MAX_LENGTH, `Не длиннее ${TEXT_MAX_LENGTH} символов`),
  phone: optionalText(PHONE_MAX_LENGTH, `Телефон должен быть не длиннее ${PHONE_MAX_LENGTH} символов`),
  email: z
    .string()
    .trim()
    .max(EMAIL_MAX_LENGTH, `Почта должна быть не длиннее ${EMAIL_MAX_LENGTH} символов`)
    .refine((value) => value === "" || z.email().safeParse(value).success, {
      message: "Проверьте адрес почты: он должен выглядеть как name@example.com",
    })
    .transform((value) => (value === "" ? null : value)),
});

export const noteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Напишите текст заметки")
    .max(NOTE_MAX_LENGTH, `Заметка должна быть не длиннее ${NOTE_MAX_LENGTH} символов`),
});
