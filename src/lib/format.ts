const pluralRules = new Intl.PluralRules("ru-RU");
const numberFormat = new Intl.NumberFormat("ru-RU");
const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
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

// Up to two initials: "Анна Смирнова" -> "АС", "Мама" -> "М".
export function getInitials(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((word) => Array.from(word).find((char) => /[\p{L}\p{N}]/u.test(char)))
    .filter((char): char is string => Boolean(char));
  return letters.slice(0, 2).join("").toUpperCase() || "?";
}

const AVATAR_COLORS = [
  "bg-rose-100 text-rose-800",
  "bg-orange-100 text-orange-800",
  "bg-amber-100 text-amber-800",
  "bg-lime-100 text-lime-800",
  "bg-emerald-100 text-emerald-800",
  "bg-cyan-100 text-cyan-800",
  "bg-sky-100 text-sky-800",
  "bg-indigo-100 text-indigo-800",
  "bg-violet-100 text-violet-800",
  "bg-fuchsia-100 text-fuchsia-800",
];

// Stable color per name, so the same person always looks the same in the list and in the card.
export function getAvatarColor(name: string): string {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 1_000_003;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
