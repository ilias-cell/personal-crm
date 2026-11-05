import { describe, expect, it } from "vitest";

import { formatContactListSummary, formatGroupSize } from "@/lib/format";

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
    expect(formatContactListSummary({ totalCount: 998, foundCount: null, first: 51, last: 100 })).toBe(
      "Показаны 51–100 из 998",
    );
  });

  it("shows the last page without a search", () => {
    expect(formatContactListSummary({ totalCount: 998, foundCount: null, first: 951, last: 998 })).toBe(
      "Показаны 951–998 из 998",
    );
  });

  it("shows the numbers of the found contacts on a page", () => {
    expect(formatContactListSummary({ totalCount: 998, foundCount: 120, first: 51, last: 100 })).toBe(
      "Найдено: 120 из 998 · показаны 51–100",
    );
  });

  it("shows the total when everything fits on one page", () => {
    expect(formatContactListSummary({ totalCount: 12, foundCount: null, first: 1, last: 12 })).toBe(
      "Всего: 12 контактов",
    );
  });

  it("shows how many were found when they fit on one page", () => {
    expect(formatContactListSummary({ totalCount: 998, foundCount: 7, first: 1, last: 7 })).toBe("Найдено: 7 из 998");
  });

  it("counts a group that fits on one page", () => {
    expect(formatContactListSummary({ totalCount: 12, foundCount: null, first: 1, last: 12, inGroup: true })).toBe(
      "В группе: 12 контактов",
    );
  });

  it("shows the numbers on a page of a big group", () => {
    expect(formatContactListSummary({ totalCount: 120, foundCount: null, first: 51, last: 100, inGroup: true })).toBe(
      "Показаны 51–100 из 120",
    );
  });

  it("counts the found people inside a group", () => {
    expect(formatContactListSummary({ totalCount: 12, foundCount: 3, first: 1, last: 3, inGroup: true })).toBe(
      "Найдено: 3 из 12",
    );
  });
});
