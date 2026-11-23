import { describe, expect, it } from "vitest";

import { nextBirthday, ownerToday, parseBirthDate, upcomingBirthdays } from "@/lib/birth-date";

// "Today" is passed in, so the tests do not depend on the real date.
const TODAY = { year: 2026, month: 11, day: 23 };

function parse(day: string, month: string, year: string) {
  return parseBirthDate({ day, month, year }, TODAY);
}

function expectError(day: string, month: string, year: string, message: string) {
  expect(parse(day, month, year)).toEqual({ ok: false, message });
}

describe("parseBirthDate: what is accepted", () => {
  it("takes an empty date as no date", () => {
    expect(parse("", "", "")).toEqual({
      ok: true,
      value: { birthDay: null, birthMonth: null, birthYear: null },
    });
  });

  it("takes spaces only as an empty date", () => {
    expect(parse("  ", " ", "   ")).toMatchObject({ ok: true, value: { birthDay: null } });
  });

  it("takes a full date", () => {
    expect(parse("14", "3", "1990")).toEqual({
      ok: true,
      value: { birthDay: 14, birthMonth: 3, birthYear: 1990 },
    });
  });

  it("takes a date without a year", () => {
    expect(parse("14", "3", "")).toEqual({
      ok: true,
      value: { birthDay: 14, birthMonth: 3, birthYear: null },
    });
  });

  it("ignores spaces around the numbers", () => {
    expect(parse(" 14 ", "3", " 1990 ")).toEqual({
      ok: true,
      value: { birthDay: 14, birthMonth: 3, birthYear: 1990 },
    });
  });

  it("takes 29 February without a year", () => {
    expect(parse("29", "2", "")).toMatchObject({
      ok: true,
      value: { birthDay: 29, birthMonth: 2 },
    });
  });

  it("takes 29 February of a leap year", () => {
    expect(parse("29", "2", "1992")).toMatchObject({ ok: true, value: { birthYear: 1992 } });
    expect(parse("29", "2", "2000")).toMatchObject({ ok: true, value: { birthYear: 2000 } });
  });

  it("takes the first year, the current year and today", () => {
    expect(parse("1", "1", "1900")).toMatchObject({ ok: true });
    expect(parse("23", "11", "2026")).toMatchObject({ ok: true });
  });
});

describe("parseBirthDate: what is refused", () => {
  it("asks for the day and month when only the day is given", () => {
    expectError("14", "", "", "Укажите день и месяц");
  });

  it("asks for the day and month when only the month is given", () => {
    expectError("", "3", "", "Укажите день и месяц");
  });

  it("asks for the day and month when only the year is given", () => {
    expectError("", "", "1990", "Укажите день и месяц");
  });

  it.each(["abc", "0", "32", "-1", "1.5", "1e1", "+5"])("refuses the day «%s»", (day) => {
    expectError(day, "3", "", "День — число от 1 до 31");
  });

  it("refuses a month that is not in the list", () => {
    expectError("14", "13", "", "Выберите месяц из списка");
    expectError("14", "abc", "", "Выберите месяц из списка");
  });

  it("refuses a date that is not in the calendar", () => {
    expectError("31", "4", "", "Такой даты нет в календаре");
    expectError("30", "2", "", "Такой даты нет в календаре");
    expectError("31", "9", "1990", "Такой даты нет в календаре");
  });

  it("refuses 29 February of a year that is not a leap one", () => {
    expectError("29", "2", "1991", "Такой даты нет в календаре");
    expectError("29", "2", "1900", "Такой даты нет в календаре");
  });

  it.each(["1850", "1899", "99", "0", "abc", "19900", "1990.5", "-1990"])(
    "refuses the year «%s»",
    (year) => {
      expectError("14", "3", year, "Год — четыре цифры, от 1900 до текущего");
    },
  );

  it("refuses the year after the current one", () => {
    expectError("14", "3", "2027", "Дата рождения не может быть в будущем");
    expectError("14", "3", "9999", "Дата рождения не может быть в будущем");
  });

  it("refuses tomorrow of the current year", () => {
    expectError("24", "11", "2026", "Дата рождения не может быть в будущем");
    expectError("1", "12", "2026", "Дата рождения не может быть в будущем");
  });

  it("reports the first problem when there are several", () => {
    // The day comes before the year, the year before the calendar.
    expectError("abc", "3", "1850", "День — число от 1 до 31");
    expectError("31", "4", "1850", "Год — четыре цифры, от 1900 до текущего");
  });
});

// A person with a birthday on this day and month; the year is unknown unless given.
function person(
  name: string,
  birthDay: number,
  birthMonth: number,
  birthYear: number | null = null,
  id = 1,
) {
  return { id, name, birthDay, birthMonth, birthYear };
}

describe("nextBirthday", () => {
  const today = { year: 2026, month: 11, day: 23 };

  it("is today for a birthday today", () => {
    expect(nextBirthday(person("Анна", 23, 11), today).daysUntil).toBe(0);
  });

  it("counts the days to a birthday later this year", () => {
    expect(nextBirthday(person("Анна", 26, 11), today).daysUntil).toBe(3);
    expect(nextBirthday(person("Анна", 29, 11), today).daysUntil).toBe(6);
    expect(nextBirthday(person("Анна", 30, 11), today).daysUntil).toBe(7);
  });

  it("moves to next year when the birthday has passed", () => {
    // 22 November 2026 -> 22 November 2027 is 364 days.
    expect(nextBirthday(person("Анна", 22, 11), today).daysUntil).toBe(364);
  });

  it("counts across the end of the year: 29 December -> 2 January is 4 days", () => {
    expect(nextBirthday(person("Анна", 2, 1), { year: 2026, month: 12, day: 29 }).daysUntil).toBe(
      4,
    );
  });

  it("counts 29 February as 28 February in a year without a leap day: 26 February -> 2 days", () => {
    expect(nextBirthday(person("Анна", 29, 2), { year: 2027, month: 2, day: 26 }).daysUntil).toBe(
      2,
    );
  });

  it("counts 29 February as itself in a leap year: 26 February -> 3 days", () => {
    expect(nextBirthday(person("Анна", 29, 2), { year: 2028, month: 2, day: 26 }).daysUntil).toBe(
      3,
    );
  });

  it("moves 29 February of a leap year to 28 February of the next year when it has passed", () => {
    // 1 March 2028 -> 28 February 2029 is 364 days.
    expect(nextBirthday(person("Анна", 29, 2), { year: 2028, month: 3, day: 1 }).daysUntil).toBe(
      364,
    );
  });

  it("has no age when the year is unknown", () => {
    expect(nextBirthday(person("Анна", 26, 11), today).age).toBeNull();
  });

  it("gives the age the person turns", () => {
    expect(nextBirthday(person("Анна", 26, 11, 1990), today).age).toBe(36);
  });

  it("gives the next age when the birthday has passed this year", () => {
    expect(nextBirthday(person("Анна", 22, 11, 1990), today).age).toBe(37);
  });

  it("gives the age of someone born on 29 February in a year without that day", () => {
    // 28 February 2027: born in 1992, turns 35.
    expect(nextBirthday(person("Анна", 29, 2, 1992), { year: 2027, month: 2, day: 26 }).age).toBe(
      35,
    );
  });

  it("gives the age of someone born on 29 February in a leap year", () => {
    expect(nextBirthday(person("Анна", 29, 2, 1992), { year: 2028, month: 2, day: 26 }).age).toBe(
      36,
    );
  });
});

describe("upcomingBirthdays", () => {
  const today = { year: 2026, month: 11, day: 23 };

  it("includes today and the six days after it", () => {
    const people = [person("Сегодня", 23, 11, null, 1), person("Через шесть", 29, 11, null, 2)];
    expect(upcomingBirthdays(people, today).map((p) => p.name)).toEqual(["Сегодня", "Через шесть"]);
  });

  it("leaves out seven days and more, and yesterday", () => {
    const people = [person("Через семь", 30, 11, null, 1), person("Вчера", 22, 11, null, 2)];
    expect(upcomingBirthdays(people, today)).toEqual([]);
  });

  it("sees a birthday in January from the end of December", () => {
    const people = [person("Анна", 2, 1), person("Борис", 5, 1)];
    expect(
      upcomingBirthdays(people, { year: 2026, month: 12, day: 29 }).map((p) => [
        p.name,
        p.daysUntil,
      ]),
    ).toEqual([["Анна", 4]]);
  });

  it("puts the nearest first", () => {
    const people = [
      person("Борис", 28, 11, null, 1),
      person("Вера", 23, 11, null, 2),
      person("Глеб", 25, 11, null, 3),
    ];
    expect(upcomingBirthdays(people, today).map((p) => p.name)).toEqual(["Вера", "Глеб", "Борис"]);
  });

  it("puts people with one day by name", () => {
    const people = [person("Борис", 25, 11, null, 1), person("Анна", 25, 11, null, 2)];
    expect(upcomingBirthdays(people, today).map((p) => p.name)).toEqual(["Анна", "Борис"]);
  });

  it("puts two people with the same name and day by id", () => {
    const people = [person("Анна", 25, 11, null, 7), person("Анна", 25, 11, null, 3)];
    expect(upcomingBirthdays(people, today).map((p) => p.id)).toEqual([3, 7]);
  });

  it("gives the days, the age and the data of the person", () => {
    const [found] = upcomingBirthdays([person("Анна", 26, 11, 1990, 5)], today);
    expect(found).toEqual({
      id: 5,
      name: "Анна",
      birthDay: 26,
      birthMonth: 11,
      birthYear: 1990,
      daysUntil: 3,
      age: 36,
    });
  });
});

describe("ownerToday", () => {
  it("is the date in Moscow, not in UTC", () => {
    // 21:30 UTC on 22 November is 00:30 on 23 November in Moscow (UTC+3).
    expect(ownerToday(new Date("2026-11-22T21:30:00Z"))).toEqual({
      year: 2026,
      month: 11,
      day: 23,
    });
  });

  it("is still the same day in Moscow just before midnight", () => {
    // 20:59 UTC is 23:59 in Moscow.
    expect(ownerToday(new Date("2026-11-22T20:59:00Z"))).toEqual({
      year: 2026,
      month: 11,
      day: 22,
    });
  });

  it("does not depend on the winter or summer time of the server", () => {
    expect(ownerToday(new Date("2026-07-01T20:59:59Z"))).toEqual({ year: 2026, month: 7, day: 1 });
    expect(ownerToday(new Date("2026-07-01T21:00:00Z"))).toEqual({ year: 2026, month: 7, day: 2 });
  });
});
