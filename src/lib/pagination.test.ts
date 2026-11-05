import { describe, expect, it } from "vitest";

import { contactListHref, parseGroupId } from "@/lib/pagination";

describe("parseGroupId", () => {
  it("reads the number of a group", () => {
    expect(parseGroupId("5")).toBe(5);
    expect(parseGroupId(["5", "7"])).toBe(5);
  });

  it.each(["abc", "", "0", "-3", "1.5", "5abc", "1234567890", " 5"])("takes «%s» for no group", (raw) => {
    expect(parseGroupId(raw)).toBeNull();
  });

  it("takes a missing parameter for no group", () => {
    expect(parseGroupId(undefined)).toBeNull();
    expect(parseGroupId([])).toBeNull();
  });
});

describe("contactListHref", () => {
  it("keeps the addresses without a group as they were", () => {
    expect(contactListHref({ search: "", page: 1 })).toBe("/");
    expect(contactListHref({ search: "анна", page: 1 })).toBe("/?q=%D0%B0%D0%BD%D0%BD%D0%B0");
    expect(contactListHref({ search: "", page: 2 })).toBe("/?page=2");
    expect(contactListHref({ search: "", group: null, page: 1 })).toBe("/");
  });

  it("puts the group, then the search, then the page", () => {
    expect(contactListHref({ search: "", group: 5, page: 2 })).toBe("/?group=5&page=2");
    expect(contactListHref({ search: "анна", group: 5, page: 3 })).toBe("/?group=5&q=%D0%B0%D0%BD%D0%BD%D0%B0&page=3");
  });

  it("opens the first group page as /?group=5", () => {
    expect(contactListHref({ search: "", group: 5, page: 1 })).toBe("/?group=5");
  });

  it("keeps the search when the group is dropped, and the group when the search is dropped", () => {
    expect(contactListHref({ search: "анна", group: null, page: 1 })).toBe("/?q=%D0%B0%D0%BD%D0%BD%D0%B0");
    expect(contactListHref({ search: "", group: 5, page: 1 })).toBe("/?group=5");
  });

  it("switches to another group on its first page, keeping the search", () => {
    expect(contactListHref({ search: "анна", group: 7, page: 1 })).toBe("/?group=7&q=%D0%B0%D0%BD%D0%BD%D0%B0");
  });
});
