import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";

import { ContactAvatar } from "@/components/contact-avatar";
import type { UpcomingBirthday } from "@/lib/birth-date";
import { listUpcomingBirthdays } from "@/lib/birthdays";
import { formatBirthDate, formatBirthdayWhen, formatTurningAge } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

// «Скоро день рождения» above the search on the home page: who has a birthday today or in the next 6 days.
// No birthdays, no block: nothing is drawn, not even a heading or an empty message.
export async function UpcomingBirthdays() {
  // Who is next depends on today's date, so it is read on every visit, never at build time.
  await connection();
  const user = await requireUser();
  const people = await listUpcomingBirthdays(user.id);
  if (people.length === 0) return null;

  return (
    <section className="flex flex-col gap-2" aria-labelledby="upcoming-birthdays-heading">
      <h2
        id="upcoming-birthdays-heading"
        className="font-serif text-22 font-normal tracking-[-0.015em]"
      >
        Скоро день рождения
      </h2>
      <ul className="divide-y divide-line-soft overflow-hidden rounded-card border bg-card lg:shadow-card">
        {people.map((person) => (
          <li key={person.id}>
            <BirthdayRow person={person} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function BirthdayRow({ person }: { person: UpcomingBirthday }) {
  // The date without the year: the year of birth is not what the owner needs here, the age is.
  const date = formatBirthDate({
    birthDay: person.birthDay,
    birthMonth: person.birthMonth,
    birthYear: null,
  });

  return (
    <Link
      href={`/contacts/${person.id}`}
      className="flex items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-field focus-visible:bg-field"
    >
      <ContactAvatar name={person.name} />
      <span className="grid min-w-0 flex-1 gap-0.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-4">
        <span className="font-serif text-17 break-words sm:col-start-1">{person.name}</span>
        <span
          className={cn(
            "text-sm font-medium tabular-nums sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:whitespace-nowrap",
            person.daysUntil === 0 && "text-accent",
          )}
        >
          {formatBirthdayWhen(person.daysUntil)}
        </span>
        <span className="text-13 text-subtle sm:col-start-1">
          {date}
          {person.age !== null && ` · ${formatTurningAge(person.age)}`}
        </span>
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-placeholder" aria-hidden="true" />
    </Link>
  );
}
