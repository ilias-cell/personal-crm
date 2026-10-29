// The owner's calendar: "Пора связаться" counts days in this time zone, whatever zone the server runs in.
export const OWNER_TIME_ZONE = "Europe/Moscow";

const pluralRules = new Intl.PluralRules("ru-RU");
const numberFormat = new Intl.NumberFormat("ru-RU");
const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const ownerDateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: OWNER_TIME_ZONE,
});
const dateTimeFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

type PluralForms = { one: string; few: string; many: string };

// Russian plural agreement: 1 контакт, 2 контакта, 5 контактов.
function pluralize(count: number, forms: PluralForms): string {
  const rule = pluralRules.select(count);
  if (rule === "one") return forms.one;
  if (rule === "few") return forms.few;
  return forms.many;
}

export function formatContactCount(count: number): string {
  const noun = pluralize(count, { one: "контакт", few: "контакта", many: "контактов" });
  return `${numberFormat.format(count)} ${noun}`;
}

export function formatNoteCount(count: number): string {
  const noun = pluralize(count, { one: "заметка", few: "заметки", many: "заметок" });
  return `${numberFormat.format(count)} ${noun}`;
}

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function formatDate(date: Date): string {
  return dateFormat.format(date);
}

export function formatDateTime(date: Date): string {
  return dateTimeFormat.format(date);
}

// The day on the owner's calendar, the same one "Пора связаться" counts from.
export function formatOwnerDate(date: Date): string {
  return ownerDateFormat.format(date);
}

// "пора сегодня", "просрочено на 1 день", "просрочено на 3 дня", "просрочено на 16 дней".
export function formatOverdue(days: number): string {
  if (days === 0) return "пора сегодня";
  const noun = pluralize(days, { one: "день", few: "дня", many: "дней" });
  return `просрочено на ${numberFormat.format(days)} ${noun}`;
}

// Up to two initials: "Анна Смирнова" -> "АС", "Мама" -> "М".
export function getInitials(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((word) => Array.from(word).find((char) => /[\p{L}\p{N}]/u.test(char)))
    .filter((char): char is string => Boolean(char));
  return letters.slice(0, 2).join("").toUpperCase() || "?";
}
