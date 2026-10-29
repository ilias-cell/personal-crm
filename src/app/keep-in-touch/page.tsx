import { ChevronRightIcon, CircleCheckIcon, ClockIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { BackLink } from "@/components/back-link";
import { ContactAvatar } from "@/components/contact-avatar";
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
import { TOUCH_FREQUENCY_LABELS } from "@/lib/contact-form";
import { formatOverdue, formatOwnerDate } from "@/lib/format";
import { hasAnyTouchFrequency, listOverdueContacts, type OverdueContact } from "@/lib/keep-in-touch";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Пора связаться",
};

export default function KeepInTouchPage() {
  return (
    <main className="flex flex-col gap-4">
      <BackLink href="/">Все контакты</BackLink>
      <header className="border-b-2 border-ink pb-3">
        <h1 className="font-serif text-32 font-normal tracking-[-0.015em] lg:text-4xl lg:leading-[1.12]">
          Пора связаться
        </h1>
      </header>
      <Suspense fallback={<OverdueListSkeleton />}>
        <OverdueList />
      </Suspense>
    </main>
  );
}

async function OverdueList() {
  // Who is overdue depends on today's date, so the list is read on every visit, never at build time.
  await connection();
  const people = await listOverdueContacts();

  if (people.length === 0) {
    return (await hasAnyTouchFrequency()) ? <AllInTouch /> : <NoFrequencyYet />;
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Кому пора связаться">
      <p className="text-15 text-muted-foreground">
        С этими людьми вы не общались дольше, чем хотели. Сверху — у кого срок прошёл раньше всех.
      </p>
      <ul className="divide-y divide-line-soft overflow-hidden rounded-card border bg-card lg:shadow-card">
        {people.map((person) => (
          <li key={person.id}>
            <OverdueRow person={person} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function OverdueRow({ person }: { person: OverdueContact }) {
  const lastNote = person.lastNoteAt
    ? `Последняя заметка: ${formatOwnerDate(person.lastNoteAt)}`
    : "заметок ещё нет";

  return (
    <Link
      href={`/contacts/${person.id}`}
      className="flex items-start gap-3 px-4 py-3.5 outline-none transition-colors hover:bg-field focus-visible:bg-field sm:items-center"
    >
      <ContactAvatar name={person.name} />
      {/* Phone: name, how overdue, then frequency and last note, one under another.
          Wider screens: how overdue moves to the right of the other two. */}
      <span className="grid min-w-0 flex-1 gap-0.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-4">
        <span className="font-serif text-17 break-words sm:col-start-1">{person.name}</span>
        <span
          className={cn(
            "text-sm font-medium tabular-nums sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:whitespace-nowrap",
            person.overdueDays === 0 && "text-accent",
          )}
        >
          {formatOverdue(person.overdueDays)}
        </span>
        <span className="text-13 text-subtle sm:col-start-1">
          {TOUCH_FREQUENCY_LABELS[person.touchFrequency]} · {lastNote}
        </span>
      </span>
      <ChevronRightIcon className="size-4 shrink-0 self-center text-placeholder" aria-hidden="true" />
    </Link>
  );
}

function AllInTouch() {
  return (
    <Empty className="border border-input py-12">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CircleCheckIcon />
        </EmptyMedia>
        <EmptyTitle>Со всеми на связи</EmptyTitle>
        <EmptyDescription>Ни у кого срок не прошёл. Когда кому-то пора будет написать, он появится здесь.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <AllContactsButton />
      </EmptyContent>
    </Empty>
  );
}

function NoFrequencyYet() {
  return (
    <Empty className="border border-input py-12">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ClockIcon />
        </EmptyMedia>
        <EmptyTitle>Пока ни для кого не задано, как часто общаться</EmptyTitle>
        <EmptyDescription>
          Откройте контакт, нажмите «Редактировать» и выберите в поле «Как часто общаться», например, «Раз в месяц».
          Когда срок пройдёт, человек появится здесь.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <AllContactsButton />
      </EmptyContent>
    </Empty>
  );
}

function AllContactsButton() {
  return (
    <Link href="/" className={buttonVariants({ variant: "outline", size: "lg", className: "h-10 px-4" })}>
      Все контакты
    </Link>
  );
}

function OverdueListSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-5 w-96 max-w-full" />
      <div className="divide-y divide-line-soft overflow-hidden rounded-card border bg-card">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex h-18 items-center gap-3 px-4">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-72 max-w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
