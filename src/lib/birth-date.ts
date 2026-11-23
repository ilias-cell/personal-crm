// Birth dates: parsing what the form sends, and the calendar arithmetic behind "Скоро день рождения".
// Shared between the form (browser) and the server, so it must stay free of server-only code.

import { OWNER_TIME_ZONE } from "@/lib/format";

export const MIN_BIRTH_YEAR = 1900;

// A birthday shows in "Скоро день рождения" today and in the next 6 days: 7 days in all.
export const BIRTHDAY_WINDOW_DAYS = 7;

// A day on a calendar, without a time and a time zone.
export type CalendarDate = { year: number; month: number; day: number };

// What the form sends: three strings, any of them may be empty.
export type BirthDateInput = { day: string; month: string; year: string };

// What is stored: all three NULL for "no date", the year NULL for "year unknown".
export type BirthDateValue = {
  birthDay: number | null;
  birthMonth: number | null;
  birthYear: number | null;
};

export type BirthDateResult = { ok: true; value: BirthDateValue } | { ok: false; message: string };

export const BIRTH_DATE_MESSAGES = {
  dayAndMonthRequired: "Укажите день и месяц",
  dayInvalid: "День — число от 1 до 31",
  monthInvalid: "Выберите месяц из списка",
  yearInvalid: `Год — четыре цифры, от ${MIN_BIRTH_YEAR} до текущего`,
  notInCalendar: "Такой даты нет в календаре",
  inFuture: "Дата рождения не может быть в будущем",
} as const;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// Without a year, February has 29 days: a person born on 29 February may not know or tell the year.
export function daysInMonth(month: number, year: number | null): number {
  if (month === 2) return year === null || isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

// Only digits: no sign, no decimal point, no exponent.
function parseWholeNumber(text: string): number | null {
  return /^\d+$/.test(text) ? Number(text) : null;
}

// Checks the three strings in this order and gives the first problem:
// nothing at all (no date) -> day and month together -> day -> month -> year -> the calendar -> not in the future.
// "Today" is a parameter, so a test can set it; the app passes the owner's today.
export function parseBirthDate(input: BirthDateInput, today: CalendarDate): BirthDateResult {
  const dayText = input.day.trim();
  const monthText = input.month.trim();
  const yearText = input.year.trim();
  const fail = (message: string): BirthDateResult => ({ ok: false, message });

  if (dayText === "" && monthText === "" && yearText === "") {
    return { ok: true, value: { birthDay: null, birthMonth: null, birthYear: null } };
  }
  if (dayText === "" || monthText === "") return fail(BIRTH_DATE_MESSAGES.dayAndMonthRequired);

  const day = parseWholeNumber(dayText);
  if (day === null || day < 1 || day > 31) return fail(BIRTH_DATE_MESSAGES.dayInvalid);

  const month = parseWholeNumber(monthText);
  if (month === null || month < 1 || month > 12) return fail(BIRTH_DATE_MESSAGES.monthInvalid);

  let year: number | null = null;
  if (yearText !== "") {
    year = /^\d{4}$/.test(yearText) ? Number(yearText) : null;
    if (year === null || year < MIN_BIRTH_YEAR) return fail(BIRTH_DATE_MESSAGES.yearInvalid);
  }

  if (day > daysInMonth(month, year)) return fail(BIRTH_DATE_MESSAGES.notInCalendar);

  // The upper limit of the year ("до текущего") is this check: the year after the current one is a date in the future.
  if (year !== null && compareDates({ year, month, day }, today) > 0) {
    return fail(BIRTH_DATE_MESSAGES.inFuture);
  }

  return { ok: true, value: { birthDay: day, birthMonth: month, birthYear: year } };
}

// Negative: a is earlier than b; zero: the same day.
export function compareDates(a: CalendarDate, b: CalendarDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

const ownerDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: OWNER_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

// The day on the owner's calendar at this moment. The server runs in UTC, so its own date would be a day
// behind between 00:00 and 03:00 in Moscow.
export function ownerToday(asOf: Date = new Date()): CalendarDate {
  const parts = ownerDayFormat.formatToParts(asOf);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Whole days from one calendar day to another, counted in UTC so that summer and winter time cannot shift them.
function daysBetween(from: CalendarDate, to: CalendarDate): number {
  const fromMs = Date.UTC(from.year, from.month - 1, from.day);
  const toMs = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((toMs - fromMs) / MS_PER_DAY);
}

export type BirthdayPerson = {
  id: number;
  name: string;
  birthDay: number;
  birthMonth: number;
  birthYear: number | null;
};

export type UpcomingBirthday = BirthdayPerson & {
  // 0: the birthday is today.
  daysUntil: number;
  // How old the person turns; null when the year of birth is unknown.
  age: number | null;
};

// The nearest birthday on or after today: this year's, or next year's when this year's has passed.
// 29 February is celebrated on 28 February in a year that has no 29 February.
export function nextBirthday(
  {
    birthDay,
    birthMonth,
    birthYear,
  }: Pick<BirthdayPerson, "birthDay" | "birthMonth" | "birthYear">,
  today: CalendarDate,
): Pick<UpcomingBirthday, "daysUntil" | "age"> {
  const dateIn = (year: number): CalendarDate => ({
    year,
    month: birthMonth,
    day: Math.min(birthDay, daysInMonth(birthMonth, year)),
  });

  let next = dateIn(today.year);
  if (compareDates(next, today) < 0) next = dateIn(today.year + 1);

  return {
    daysUntil: daysBetween(today, next),
    age: birthYear === null ? null : next.year - birthYear,
  };
}

// Who has a birthday in the window, the nearest first, then by name, then by id.
export function upcomingBirthdays(
  people: BirthdayPerson[],
  today: CalendarDate,
  windowDays: number = BIRTHDAY_WINDOW_DAYS,
): UpcomingBirthday[] {
  return people
    .map((person) => ({ ...person, ...nextBirthday(person, today) }))
    .filter((person) => person.daysUntil < windowDays)
    .sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name, "ru") || a.id - b.id);
}
