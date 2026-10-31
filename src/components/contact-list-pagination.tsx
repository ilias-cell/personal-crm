import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { contactListHref, getPageItems } from "@/lib/pagination";

// The page switcher of the contact list; shown above and below it, and not at all when everything fits on one page.
// Buttons are 32px on a phone, so all nine items fit into 375px, and 36px from the sm breakpoint.
export function ContactListPagination({
  page,
  pageCount,
  search,
  className,
}: {
  page: number;
  pageCount: number;
  search: string;
  className?: string;
}) {
  if (pageCount <= 1) return null;
  const href = (target: number) => contactListHref({ search, page: target });

  return (
    <Pagination aria-label="Страницы списка" className={className}>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href={page > 1 ? href(page - 1) : undefined} className="sm:h-9" />
        </PaginationItem>
        {getPageItems(page, pageCount).map((item) => (
          <PaginationItem key={item}>
            {typeof item === "number" ? (
              <PaginationLink
                href={href(item)}
                isActive={item === page}
                aria-label={`Страница ${item}`}
                className="tabular-nums sm:size-9"
              >
                {item}
              </PaginationLink>
            ) : (
              <PaginationEllipsis className="sm:size-9" />
            )}
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext href={page < pageCount ? href(page + 1) : undefined} className="sm:h-9" />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
