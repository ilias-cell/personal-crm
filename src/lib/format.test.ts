import { describe, expect, it } from "vitest";

import {
  formatBirthDate,
  formatBirthdayWhen,
  formatContactListSummary,
  formatGroupSize,
  formatOverdue,
  formatOwnerDate,
  formatTurningAge,
} from "@/lib/format";

describe("formatGroupSize", () => {
  it.each([
    [0, "пока никого"],
    [1, "1 контакт"],
    [2, "2 контакта"],
    [11, "11 контактов"],
    [12, "12 контактов"],
    [21, "21 контакт"],
  ])("writes %i as «%s»", (count, expected) => {
    expect(formatGroupSize(count)).toBe(expected);
  });
});

describe("formatContactListSummary", () => {
  it("shows the numbers of the contacts on a page without a search", () => {
    expect(
      formatContactListSummary({ totalCount: 998, foundCount: null, first: 51, last: 100 }),
    ).toBe("Показаны 51–100 из 998");
  });

  it("shows the last page without a search", () => {
    expect(
      formatContactListSummary({ totalCount: 998, foundCount: null, first: 951, last: 998 }),
    ).toBe("Показаны 951–998 из 998");
  });

  it("shows the numbers of the found contacts on a page", () => {
    expect(
      formatContactListSummary({ totalCount: 998, foundCount: 120, first: 51, last: 100 }),
    ).toBe("Найдено: 120 из 998 · показаны 51–100");
  });

  it("shows the total when everything fits on one page", () => {
    expect(formatContactListSummary({ totalCount: 12, foundCount: null, first: 1, last: 12 })).toBe(
      "Всего: 12 контактов",
    );
  });

  it("shows how many were found when they fit on one page", () => {
    expect(formatContactListSummary({ totalCount: 998, foundCount: 7, first: 1, last: 7 })).toBe(
      "Найдено: 7 из 998",
    );
  });

  it("counts a group that fits on one page", () => {
    expect(
      formatContactListSummary({
        totalCount: 12,
        foundCount: null,
        first: 1,
        last: 12,
        inGroup: true,
      }),
    ).toBe("В группе: 12 контактов");
  });

  it("shows the numbers on a page of a big group", () => {
    expect(
      formatContactListSummary({
        totalCount: 120,
        foundCount: null,
        first: 51,
        last: 100,
        inGroup: true,
      }),
    ).toBe("Показаны 51–100 из 120");
  });

  it("counts the found people inside a group", () => {
    expect(
      formatContactListSummary({ totalCount: 12, foundCount: 3, first: 1, last: 3, inGroup: true }),
    ).toBe("Найдено: 3 из 12");
  });
});

describe("formatOverdue", () => {
  it.each([
    [0, "пора сегодня"],
    [1, "просрочено на 1 день"],
    [3, "просрочено на 3 дня"],
    [16, "просрочено на 16 дней"],
    [21, "просрочено на 21 день"],
  ])("writes %i days as «%s»", (days, expected) => {
    expect(formatOverdue(days)).toBe(expected);
  });
});

describe("formatOwnerDate", () => {
  it("writes the day of a note in Moscow time", () => {
    expect(formatOwnerDate(new Date("2026-10-01T23:30:00+03:00"))).toBe("1 октября 2026 г.");
    expect(formatOwnerDate(new Date("2026-10-02T00:30:00+03:00"))).toBe("2 октября 2026 г.");
  });
});

describe("formatBirthDate", () => {
  it("writes a date with a year", () => {
    expect(formatBirthDate({ birthDay: 14, birthMonth: 3, birthYear: 1990 })).toBe("14 марта 1990");
  });

  it("writes a date without a year", () => {
    expect(formatBirthDate({ birthDay: 14, birthMonth: 3, birthYear: null })).toBe("14 марта");
  });

  it("writes 29 February without a year", () => {
    expect(formatBirthDate({ birthDay: 29, birthMonth: 2, birthYear: null })).toBe("29 февраля");
  });

  it("writes 29 February of a leap year", () => {
    expect(formatBirthDate({ birthDay: 29, birthMonth: 2, birthYear: 1992 })).toBe(
      "29 февраля 1992",
    );
  });

  it("writes «не указано» when there is no date", () => {
    expect(formatBirthDate({ birthDay: null, birthMonth: null, birthYear: null })).toBe(
      "не указано",
    );
  });

  it("writes every month in the genitive case", () => {
    const months = Array.from({ length: 12 }, (_, index) =>
      formatBirthDate({ birthDay: 1, birthMonth: index + 1, birthYear: null }),
    );
    expect(months).toEqual([
      "1 января",
      "1 февраля",
      "1 марта",
      "1 апреля",
      "1 мая",
      "1 июня",
      "1 июля",
      "1 августа",
      "1 сентября",
      "1 октября",
      "1 ноября",
      "1 декабря",
    ]);
  });
});

describe("formatBirthdayWhen", () => {
  it.each([
    [0, "Сегодня"],
    [1, "Завтра"],
    [2, "Через 2 дня"],
    [3, "Через 3 дня"],
    [4, "Через 4 дня"],
    [5, "Через 5 дней"],
    [6, "Через 6 дней"],
  ])("writes %i days as «%s»", (days, expected) => {
    expect(formatBirthdayWhen(days)).toBe(expected);
  });
});

describe("formatTurningAge", () => {
  it("writes the age the person turns", () => {
    expect(formatTurningAge(36)).toBe("исполняется 36");
  });
});
