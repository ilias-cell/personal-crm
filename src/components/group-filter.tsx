import Link from "next/link";

import { LinkPending } from "@/components/link-pending";
import { listGroups } from "@/lib/groups";
import { contactListHref } from "@/lib/pagination";
import { cn } from "@/lib/utils";

const chipClassName =
  "inline-flex h-8 items-center rounded-full px-3 text-sm whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50";

// The row of labels under the search: "Все" and the groups. One is chosen at a time; choosing keeps the search
// and opens the first page. No groups, no row. On a phone it stays one line and scrolls sideways.
export async function GroupFilter({
  search,
  selectedGroupId,
}: {
  search: string;
  selectedGroupId: number | null;
}) {
  const groups = await listGroups();
  if (groups.length === 0) return null;

  const items = [{ id: null, name: "Все" }, ...groups];

  return (
    <nav
      aria-label="Группы"
      className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:overflow-visible sm:px-0"
    >
      <ul className="flex w-max items-center gap-2 sm:w-auto sm:flex-wrap">
        {items.map((item) => {
          const isSelected = item.id === selectedGroupId;
          return (
            <li key={item.id ?? "all"}>
              <Link
                href={contactListHref({ search, group: item.id, page: 1 })}
                aria-current={isSelected ? "page" : undefined}
                className={cn(
                  chipClassName,
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {item.name}
                <LinkPending />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
