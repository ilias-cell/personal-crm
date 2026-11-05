import { ChevronRightIcon, ClockIcon, PlusIcon, SearchXIcon, TagsIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { ContactAvatar } from "@/components/contact-avatar";
import { RememberContactListHref } from "@/components/contact-list-link";
import { ContactListPagination } from "@/components/contact-list-pagination";
import { GroupBadge } from "@/components/group-badge";
import { GroupFilter } from "@/components/group-filter";
import { SearchInput, SearchInputFallback } from "@/components/search-input";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { countContacts, listContacts, type ContactListItem } from "@/lib/contacts";
import { formatContactListSummary, formatNumber } from "@/lib/format";
import { countOverdueContacts } from "@/lib/keep-in-touch";
import { getGroup } from "@/lib/groups";
import { contactListHref, PAGE_SIZE, parseGroupId, parsePage } from "@/lib/pagination";

export default function ContactsPage({ searchParams }: PageProps<"/">) {
  return (
    <main className="group/contacts flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b-2 border-ink pb-3">
        <h1 className="font-serif text-32 font-normal tracking-[-0.015em] lg:text-4xl lg:leading-[1.12]">Контакты</h1>
        <div className="flex flex-wrap items-center gap-x-6">
          <Link
            href="/keep-in-touch"
            className="inline-flex h-10 items-center gap-1.5 text-sm font-medium whitespace-nowrap text-accent hover:opacity-80"
          >
            <ClockIcon className="size-4" aria-hidden="true" />
            Пора связаться
            {/* The link shows at once; the number joins it when counted, and stays away while nobody is overdue. */}
            <Suspense fallback={null}>
              <OverdueCount />
            </Suspense>
          </Link>
          <Link
            href="/groups"
            className="inline-flex h-10 items-center gap-1.5 text-sm font-medium whitespace-nowrap text-accent hover:opacity-80"
          >
            <TagsIcon className="size-4" aria-hidden="true" />
            Группы
          </Link>
          <Link
            href="/contacts/new"
            className="inline-flex h-10 items-center gap-1.5 text-sm font-medium whitespace-nowrap text-accent hover:opacity-80"
          >
            <PlusIcon className="size-4" aria-hidden="true" />
            Добавить контакт
          </Link>
        </div>
      </header>

      {/* "Все контакты" on other pages leads back to this page and search. */}
      <Suspense fallback={null}>
        <RememberContactListHref />
      </Suspense>

      {/* Stays on screen while scrolling a long list, so search is always one click away. */}
      <div className="sticky top-0 z-10 -mx-6 bg-background/92 px-6 py-2 backdrop-blur-sm">
        <Suspense fallback={<SearchInputFallback />}>
          <SearchInput />
        </Suspense>
      </div>

      {/* Groups to choose from; no groups, no row. */}
      <Suspense fallback={null}>
        <GroupFilterRow searchParams={searchParams} />
      </Suspense>

      {/* The list dims while a new search is loading; the search input sets data-pending. */}
      <div className="transition-opacity group-has-data-pending/contacts:opacity-60">
        <Suspense fallback={<ContactListSkeleton />}>
          <ContactList searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function OverdueCount() {
  // Who is overdue depends on today's date, so it is counted on every visit, never at build time.
  await connection();
  const count = await countOverdueContacts();
  if (count === 0) return null;
  return <span className="font-semibold tabular-nums">· {formatNumber(count)}</span>;
}

function readSearch(q: string | string[] | undefined): string {
  return (Array.isArray(q) ? (q[0] ?? "") : (q ?? "")).trim();
}

// The group of the address, or null: no group in it, something that is not a group, or a group that is gone
// (deleted since the address was saved). In all of these the list shows everybody.
async function readGroup(rawGroup: string | string[] | undefined) {
  const groupId = parseGroupId(rawGroup);
  return groupId === null ? null : await getGroup(groupId);
}

async function GroupFilterRow({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const { q, group: rawGroup } = await searchParams;
  const group = await readGroup(rawGroup);
  return <GroupFilter search={readSearch(q)} selectedGroupId={group?.id ?? null} />;
}

async function ContactList({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const { q, group: rawGroup, page: rawPage } = await searchParams;
  const search = readSearch(q);
  const group = await readGroup(rawGroup);
  const groupId = group?.id ?? null;
  // Inside a group, "total" means the people of the group.
  const [totalCount, foundCount] = await Promise.all([
    countContacts("", groupId),
    search ? countContacts(search, groupId) : null,
  ]);
  const listCount = foundCount ?? totalCount;

  if (totalCount === 0 && group) {
    return (
      <Empty className="border border-input py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TagsIcon />
          </EmptyMedia>
          <EmptyTitle>В группе «{group.name}» пока никого</EmptyTitle>
          <EmptyDescription>Откройте контакт и нажмите «+ группа» в строке «Группы».</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/" className={buttonVariants({ variant: "outline", size: "lg", className: "h-10 px-4" })}>
            Показать все контакты
          </Link>
        </EmptyContent>
      </Empty>
    );
  }

  if (totalCount === 0) {
    return (
      <Empty className="border border-input py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle>Пока нет ни одного контакта</EmptyTitle>
          <EmptyDescription>Добавьте первого человека, чтобы не потерять его из виду.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/contacts/new" className={buttonVariants({ size: "lg", className: "h-10 px-4" })}>
            <PlusIcon data-icon="inline-start" />
            Добавить контакт
          </Link>
        </EmptyContent>
      </Empty>
    );
  }

  if (listCount === 0) {
    return (
      <Empty className="border border-input py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchXIcon />
          </EmptyMedia>
          <EmptyTitle>Никого не нашлось</EmptyTitle>
          <EmptyDescription>
            {group
              ? `По запросу «${search}» в группе «${group.name}» никого нет. Проверьте написание имени или сбросьте поиск.`
              : `По запросу «${search}» нет контактов. Проверьте написание имени или сбросьте поиск.`}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link
            href={contactListHref({ search: "", group: groupId, page: 1 })}
            className={buttonVariants({ variant: "outline", size: "lg", className: "h-10 px-4" })}
          >
            {group ? "Показать всех в группе" : "Показать все контакты"}
          </Link>
        </EmptyContent>
      </Empty>
    );
  }

  const pageCount = Math.ceil(listCount / PAGE_SIZE);
  // A page past the end (contacts were deleted, or the address was typed by hand) shows the last one.
  const page = Math.min(parsePage(rawPage), pageCount);
  const contacts = await listContacts(search, page, groupId);
  const first = (page - 1) * PAGE_SIZE + 1;

  return (
    <section className="flex flex-col gap-2" aria-label="Список контактов">
      {/* On a phone the switcher goes under the summary; from sm they share one line, the switcher on the right. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-13 text-subtle" aria-live="polite">
          {formatContactListSummary({
            totalCount,
            foundCount,
            first,
            last: first + contacts.length - 1,
            inGroup: group !== null,
          })}
        </p>
        <ContactListPagination
          page={page}
          pageCount={pageCount}
          search={search}
          group={groupId}
          className="sm:mx-0 sm:w-auto"
        />
      </div>
      <ul className="divide-y divide-line-soft overflow-hidden rounded-card border bg-card lg:shadow-card">
        {contacts.map((contact) => (
          <li key={contact.id}>
            <ContactRow contact={contact} />
          </li>
        ))}
      </ul>
      {/* Right-aligned from sm, under the switcher above the list. */}
      <ContactListPagination
        page={page}
        pageCount={pageCount}
        search={search}
        group={groupId}
        className="sm:justify-end"
      />
    </section>
  );
}

function ContactRow({ contact }: { contact: ContactListItem }) {
  const subtitle = [contact.about, contact.howMet].filter(Boolean).join(" · ");

  return (
    <Link
      href={`/contacts/${contact.id}`}
      className="flex h-16 items-center gap-3 px-4 outline-none transition-colors hover:bg-field focus-visible:bg-field"
    >
      <ContactAvatar name={contact.name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-serif text-17">{contact.name}</span>
        {/* One line of fixed height: the labels come first, what does not fit is cut off at the end. */}
        {(contact.groups.length > 0 || subtitle) && (
          <span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-13 text-subtle">
            {contact.groups.map((group) => (
              <GroupBadge key={group.id} className="h-5 px-1.5 text-xs">
                {group.name}
              </GroupBadge>
            ))}
            {subtitle && <span className="min-w-0 truncate">{subtitle}</span>}
          </span>
        )}
      </span>
      {(contact.phone || contact.email) && (
        <span className="hidden max-w-56 shrink-0 text-right text-13 text-subtle sm:block">
          {contact.phone && <span className="block truncate tabular-nums">{contact.phone}</span>}
          {contact.email && <span className="block truncate">{contact.email}</span>}
        </span>
      )}
      <ChevronRightIcon className="size-4 shrink-0 text-placeholder" aria-hidden="true" />
    </Link>
  );
}

function ContactListSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      <Skeleton className="h-5 w-36" />
      <div className="divide-y divide-line-soft overflow-hidden rounded-card border bg-card">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex h-16 items-center gap-3 px-4">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
