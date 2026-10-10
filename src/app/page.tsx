import { ChevronRightIcon, PlusIcon, SearchXIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { ContactAvatar } from "@/components/contact-avatar";
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
import { formatContactCount, formatNumber } from "@/lib/format";

export default function ContactsPage({ searchParams }: PageProps<"/">) {
  return (
    <main className="group/contacts flex flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Контакты</h1>
        <Link href="/contacts/new" className={buttonVariants({ size: "lg", className: "h-10 px-4" })}>
          <PlusIcon data-icon="inline-start" />
          Добавить контакт
        </Link>
      </header>

      {/* Stays on screen while scrolling a long list, so search is always one click away. */}
      <div className="sticky top-0 z-10 -mx-4 bg-muted/85 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <Suspense fallback={<SearchInputFallback />}>
          <SearchInput />
        </Suspense>
      </div>

      {/* The list dims while a new search is loading; the search input sets data-pending. */}
      <div className="transition-opacity group-has-data-pending/contacts:opacity-60">
        <Suspense fallback={<ContactListSkeleton />}>
          <ContactList searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function ContactList({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const { q } = await searchParams;
  const search = (Array.isArray(q) ? (q[0] ?? "") : (q ?? "")).trim();
  const [contacts, totalCount] = await Promise.all([listContacts(search), countContacts()]);

  if (totalCount === 0) {
    return (
      <Empty className="border bg-card py-12">
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

  if (contacts.length === 0) {
    return (
      <Empty className="border bg-card py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchXIcon />
          </EmptyMedia>
          <EmptyTitle>Никого не нашлось</EmptyTitle>
          <EmptyDescription>
            По запросу «{search}» нет контактов. Проверьте написание имени или сбросьте поиск.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/" className={buttonVariants({ variant: "outline", size: "lg", className: "h-10 px-4" })}>
            Показать все контакты
          </Link>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <section className="flex flex-col gap-2" aria-label="Список контактов">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {search
          ? `Найдено: ${formatNumber(contacts.length)} из ${formatNumber(totalCount)}`
          : `Всего: ${formatContactCount(totalCount)}`}
      </p>
      <ul className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        {contacts.map((contact) => (
          // Rows outside the screen are not painted until scrolled to: keeps a thousand rows cheap.
          <li key={contact.id} className="[contain-intrinsic-size:auto_4rem] [content-visibility:auto]">
            <ContactRow contact={contact} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ContactRow({ contact }: { contact: ContactListItem }) {
  const subtitle = [contact.about, contact.howMet].filter(Boolean).join(" · ");

  return (
    <Link
      href={`/contacts/${contact.id}`}
      className="flex h-16 items-center gap-3 px-4 outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted"
    >
      <ContactAvatar name={contact.name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{contact.name}</span>
        {subtitle && <span className="block truncate text-sm text-muted-foreground">{subtitle}</span>}
      </span>
      {(contact.phone || contact.email) && (
        <span className="hidden max-w-56 shrink-0 text-right text-sm text-muted-foreground sm:block">
          {contact.phone && <span className="block truncate tabular-nums">{contact.phone}</span>}
          {contact.email && <span className="block truncate">{contact.email}</span>}
        </span>
      )}
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
    </Link>
  );
}

function ContactListSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      <Skeleton className="h-5 w-36" />
      <div className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
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
