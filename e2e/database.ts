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

// A user who already exists, as if they had logged in before: their email is found at the next login.
// Returns the id, which owns the data inserted below.
export async function createUser(email: string): Promise<string> {
  return withDatabase(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `insert into users (id, name, email, email_verified)
       values (gen_random_uuid()::text, '', $1, true) returning id`,
      [email.trim().toLowerCase()],
    );
    return rows[0].id;
  });
}

// Contacts of the owner created one by one, so the last one is the newest.
export async function insertContacts(ownerId: string, names: string[]): Promise<void> {
  await withDatabase(async (client) => {
    for (const name of names) {
      await client.query("insert into contacts (name, owner_id) values ($1, $2)", [name, ownerId]);
    }
  });
}

// The id of the first contact with this name: the address of its card.
export async function contactIdByName(name: string): Promise<number> {
  return withDatabase(async (client) => {
    const { rows } = await client.query<{ id: number }>(
      "select id from contacts where name = $1 order by id limit 1",
      [name],
    );
    return rows[0].id;
  });
}

// What a test needs to move the clock: nobody waits 15 minutes, an hour or 30 days in a browser.

// The login links of this address stop working (they are older than 15 minutes).
export async function expireLoginLinks(email: string): Promise<void> {
  await withDatabase((client) =>
    client.query(
      `update verifications set expires_at = now() - interval '1 second'
       where case when identifier like 'magic-link:%' then value::jsonb ->> 'email' end = $1`,
      [email.trim().toLowerCase()],
    ),
  );
}

// Makes the login of this address look as if it was made so long ago that this many days are left.
export async function leaveSessionDays(email: string, days: number): Promise<void> {
  await withDatabase((client) =>
    client.query(
      `update sessions set expires_at = now() + make_interval(days => $2::int)
       where user_id = (select id from users where email = $1)`,
      [email.trim().toLowerCase(), days],
    ),
  );
}

// The login of this address ends: it was not used for more than 30 days.
export async function expireSessions(email: string): Promise<void> {
  await withDatabase((client) =>
    client.query(
      `update sessions set expires_at = now() - interval '1 second'
       where user_id = (select id from users where email = $1)`,
      [email.trim().toLowerCase()],
    ),
  );
}

// How many seconds the latest login of this address still lasts, or null if there is none.
export async function sessionSecondsLeft(email: string): Promise<number | null> {
  return withDatabase(async (client) => {
    const { rows } = await client.query<{ seconds: string | null }>(
      `select extract(epoch from (max(expires_at) - now())) as seconds from sessions
       where user_id = (select id from users where email = $1)`,
      [email.trim().toLowerCase()],
    );
    return rows[0].seconds === null ? null : Number(rows[0].seconds);
  });
}

// Makes every login email already sent look as if it was sent this many minutes ago.
export async function backdateLoginEmails(minutes: number): Promise<void> {
  await withDatabase((client) =>
    client.query(
      "update login_emails set created_at = created_at - make_interval(mins => $1::int)",
      [minutes],
    ),
  );
}

// How many login emails the app has counted for this address.
export async function countLoginEmails(email: string): Promise<number> {
  return withDatabase(async (client) => {
    const { rows } = await client.query<{ total: string }>(
      "select count(*) as total from login_emails where email = $1",
      [email.trim().toLowerCase()],
    );
    return Number(rows[0].total);
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
export async function insertContactWith(
  ownerId: string,
  { name, touchFrequency, touchRestartedDaysAgo, noteDaysAgo, groups = [] }: ContactSetup,
): Promise<{ noteAt: Date | null }> {
  return withDatabase(async (client) => {
    const { rows } = await client.query<{ id: number }>(
      `insert into contacts (name, owner_id, touch_frequency, touch_restarted_at)
       values ($1, $2, $3, now() - make_interval(days => $4::int)) returning id`,
      [name, ownerId, touchFrequency ?? null, touchRestartedDaysAgo ?? null],
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
        `with new_group as (insert into groups (name, owner_id) values ($1, $3) returning id)
         insert into contact_groups (contact_id, group_id) select $2, id from new_group`,
        [group, contactId, ownerId],
      );
    }
    return { noteAt };
  });
}

// The address of a group by its name.
export async function groupIdByName(name: string): Promise<number> {
  return withDatabase(async (client) => {
    const { rows } = await client.query<{ id: number }>(
      "select id from groups where name = $1 order by id limit 1",
      [name],
    );
    return rows[0].id;
  });
}

// Many people of the owner at once, named "<prefix> 001", "<prefix> 002" ..., all in a group of this name.
// Created one by one, so the last one is the newest.
export async function insertGroupWithPeople(
  ownerId: string,
  group: string,
  prefix: string,
  count: number,
): Promise<void> {
  await withDatabase(async (client) => {
    const { rows } = await client.query<{ id: number }>(
      "insert into groups (name, owner_id) values ($1, $2) returning id",
      [group, ownerId],
    );
    const groupId = rows[0].id;
    for (let index = 1; index <= count; index++) {
      const name = `${prefix} ${String(index).padStart(3, "0")}`;
      await client.query(
        `with new_contact as (insert into contacts (name, owner_id) values ($1, $2) returning id)
         insert into contact_groups (contact_id, group_id) select id, $3 from new_contact`,
        [name, ownerId, groupId],
      );
    }
  });
}
