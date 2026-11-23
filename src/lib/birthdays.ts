import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { contacts } from "@/db/schema";
import { ownerToday, upcomingBirthdays, type UpcomingBirthday } from "@/lib/birth-date";

export type UpcomingBirthdayOptions = {
  // Counted as of this moment: now by default; tests set "today" this way.
  asOf?: Date;
};

// The owner's contacts with a birthday today or in the next 6 days, the nearest first.
// Only the contacts of this owner are read. The window is counted in code, not in SQL: 29 February and the end
// of the year are plain arithmetic there, and one person has hundreds of contacts at most.
export async function listUpcomingBirthdays(
  ownerId: string,
  { asOf }: UpcomingBirthdayOptions = {},
): Promise<UpcomingBirthday[]> {
  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      birthDay: contacts.birthDay,
      birthMonth: contacts.birthMonth,
      birthYear: contacts.birthYear,
    })
    .from(contacts)
    // Day and month are both set or both empty (a database rule), so one of them is enough to ask.
    .where(and(eq(contacts.ownerId, ownerId), isNotNull(contacts.birthDay)));

  const people = rows.flatMap((row) =>
    row.birthDay !== null && row.birthMonth !== null
      ? [{ ...row, birthDay: row.birthDay, birthMonth: row.birthMonth }]
      : [],
  );
  return upcomingBirthdays(people, ownerToday(asOf));
}
