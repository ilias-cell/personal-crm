// The contact list on the home page is split into pages; the page number lives in the address (/?page=2).

export const PAGE_SIZE = 50;

// Anything that is not a positive page number means the first page.
// A number past the last page is fine here: the list clamps it once it knows how many contacts there are.
export function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || !/^[1-9]\d{0,5}$/.test(value)) return 1;
  return Number(value);
}

export type PageItem = number | "start-ellipsis" | "end-ellipsis";

// The first and last pages, the current one and one neighbour on each side; gaps collapse to an ellipsis,
// but a gap of a single page shows that page instead. Never more than 7 items, so the switcher keeps its width.
export function getPageItems(current: number, pageCount: number): PageItem[] {
  if (pageCount <= 7) return range(1, pageCount);

  const siblingsStart = Math.max(Math.min(current - 1, pageCount - 4), 3);
  const siblingsEnd = Math.min(Math.max(current + 1, 5), pageCount - 2);
  return [
    1,
    siblingsStart > 3 ? "start-ellipsis" : 2,
    ...range(siblingsStart, siblingsEnd),
    siblingsEnd < pageCount - 2 ? "end-ellipsis" : pageCount - 1,
    pageCount,
  ];
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

// The first page has no number in the address, so "/" and "/?q=..." keep meaning what they always did.
export function contactListHref({ search, page }: { search: string; page: number }): string {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/?${query}` : "/";
}
