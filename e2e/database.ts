import { Client } from "pg";

import { databaseName, quoteIdentifier, testDatabaseUrl } from "../src/test/test-database";

// Direct access to the e2e database, only to put it into a known state before a test.
// What the test checks always goes through the browser.

async function withDatabase<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const url = testDatabaseUrl("_e2e");
  // Refuses anything but the e2e database, so a wrong DATABASE_URL can never clear working data.
  if (!databaseName(url).endsWith("_e2e")) {
    throw new Error(
      `Refusing to use database "${databaseName(url)}": the name of the e2e database must end with _e2e.`,
    );
  }
  const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

// Empties every table.
export async function resetDatabase(): Promise<void> {
  await withDatabase(async (client) => {
    const { rows } = await client.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public'",
    );
    if (rows.length === 0) return;
    const names = rows.map(({ tablename }) => quoteIdentifier(tablename)).join(", ");
    await client.query(`truncate table ${names} restart identity cascade`);
  });
}

// Contacts created one by one, so the last one is the newest.
export async function insertContacts(names: string[]): Promise<void> {
  await withDatabase(async (client) => {
    for (const name of names) {
      await client.query("insert into contacts (name) values ($1)", [name]);
    }
  });
}

type ContactSetup = {
  name: string;
  touchFrequency?: "week" | "month" | "quarter" | "year";
  // The frequency was set or changed this many days ago.
  touchRestartedDaysAgo?: number;
  // One note written this many days ago.
  noteDaysAgo?: number;
  groups?: string[];
};

// A contact with its frequency, a note and groups, dated back from the database clock.
// Gives back the moment of the note, if there is one.
export async function insertContactWith({
  name,
  touchFrequency,
  touchRestartedDaysAgo,
  noteDaysAgo,
  groups = [],
}: ContactSetup): Promise<{ noteAt: Date | null }> {
  return withDatabase(async (client) => {
    const { rows } = await client.query<{ id: number }>(
      `insert into contacts (name, touch_frequency, touch_restarted_at)
       values ($1, $2, now() - make_interval(days => $3::int)) returning id`,
      [name, touchFrequency ?? null, touchRestartedDaysAgo ?? null],
    );
    const contactId = rows[0].id;

    let noteAt: Date | null = null;
    if (noteDaysAgo !== undefined) {
      const note = await client.query<{ created_at: Date }>(
        `insert into notes (contact_id, body, created_at)
         values ($1, 'Поговорили', now() - make_interval(days => $2::int)) returning created_at`,
        [contactId, noteDaysAgo],
      );
      noteAt = note.rows[0].created_at;
    }

    for (const group of groups) {
      await client.query(
        `with new_group as (insert into groups (name) values ($1) returning id)
         insert into contact_groups (contact_id, group_id) select $2, id from new_group`,
        [group, contactId],
      );
    }
    return { noteAt };
  });
}
