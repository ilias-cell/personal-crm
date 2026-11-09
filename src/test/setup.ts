import { beforeEach, inject } from "vitest";

// Runs in every test file before its imports of the app code: the app reads DATABASE_URL when it is first imported.
process.env.DATABASE_URL = inject("testDatabaseUrl");

// Login settings for tests. They are set, not defaulted, so a real .env of the owner can never leak into a test:
// the secret is a throwaway one, and emails always go to the local Mailpit, never to a real mailbox.
process.env.BETTER_AUTH_SECRET = "vitest-only-secret-not-a-real-secret-0123456789";
process.env.BETTER_AUTH_URL = "http://127.0.0.1:3001";
process.env.SMTP_URL = "smtp://127.0.0.1:1025";
process.env.MAIL_FROM = "Личная CRM <noreply@mail.therooks.ru>";

// Every test starts with empty tables. Refuses to touch a database that is not a test one.
beforeEach(async () => {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");

  const { rows: current } = await db.execute<{ name: string }>(
    sql`select current_database() as name`,
  );
  const name = current[0]?.name ?? "";
  if (!name.endsWith("_test")) {
    throw new Error(
      `Refusing to clear database "${name}": the name of a test database must end with _test.`,
    );
  }

  const { rows: tables } = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  if (tables.length === 0) return;
  const names = tables.map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`).join(", ");
  await db.execute(sql.raw(`truncate table ${names} restart identity cascade`));
});
