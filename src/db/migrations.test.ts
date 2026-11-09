import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";

import { databaseName, recreateDatabase } from "@/test/test-database";

import { runMigrations } from "./run-migrations";

// The login migration gives all existing data to the owner. It runs here on a separate database
// that holds "old" data (the schema of 0002), so the real test database stays untouched.

const MIGRATION_NAME = "0003_login";

const workingName = databaseName(new URL(inject("testDatabaseUrl"))).replace(/_test$/, "");
const migrationDatabaseName = `${workingName}_migration_test`;
const migrationDatabaseUrl = (() => {
  const url = new URL(inject("testDatabaseUrl"));
  url.pathname = `/${encodeURIComponent(migrationDatabaseName)}`;
  return url.toString();
})();

// A copy of the migrations folder with the journal cut before the login migration.
const oldMigrationsFolder = mkdtempSync(join(tmpdir(), "crm-old-migrations-"));
{
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
    entries: { tag: string }[];
  };
  const loginIndex = journal.entries.findIndex((entry) => entry.tag === MIGRATION_NAME);
  if (loginIndex < 0) {
    throw new Error(`Migration ${MIGRATION_NAME} is not in the journal.`);
  }
  const oldEntries = journal.entries.slice(0, loginIndex);
  mkdirSync(join(oldMigrationsFolder, "meta"));
  writeFileSync(
    join(oldMigrationsFolder, "meta", "_journal.json"),
    JSON.stringify({ ...journal, entries: oldEntries }),
  );
  for (const { tag } of oldEntries) {
    cpSync(`drizzle/${tag}.sql`, join(oldMigrationsFolder, `${tag}.sql`));
  }
}

afterAll(() => {
  rmSync(oldMigrationsFolder, { recursive: true, force: true });
});

async function query<T extends object>(sql: string, values: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: migrationDatabaseUrl });
  await client.connect();
  try {
    const result = await client.query<T>(sql, values);
    return result.rows;
  } finally {
    await client.end();
  }
}

async function count(table: string): Promise<number> {
  const [row] = await query<{ total: string }>(`select count(*) as total from ${table}`);
  return Number(row.total);
}

// The database as it was before login: contacts, notes and groups without an owner.
async function seedOldData() {
  await query(`
    insert into contacts (name, touch_frequency) values ('Вера Климова', 'month'), ('Глеб Орлов', null), ('Анна Попова', 'week');
    insert into notes (contact_id, body) values (1, 'Первая'), (1, 'Вторая'), (3, 'Третья');
    insert into groups (name) values ('Друзья'), ('Семья');
    insert into contact_groups (contact_id, group_id) values (1, 1), (2, 1), (3, 2);
  `);
}

beforeEach(async () => {
  await recreateDatabase(migrationDatabaseName);
  await runMigrations({
    connectionString: migrationDatabaseUrl,
    migrationsFolder: oldMigrationsFolder,
  });
});

describe("login migration", () => {
  it("gives all existing data to the owner", async () => {
    await seedOldData();

    await runMigrations({
      connectionString: migrationDatabaseUrl,
      migrationsFolder: "drizzle",
      ownerEmail: "  Owner@Example.COM ",
    });

    const [owner, ...others] = await query<{ id: string; email: string; email_verified: boolean }>(
      "select id, email, email_verified from users",
    );
    expect(others).toHaveLength(0);
    // The email is stored trimmed and in lower case, so the owner's login finds this user.
    expect(owner.email).toBe("owner@example.com");
    expect(owner.email_verified).toBe(true);

    const contactOwners = await query<{ owner_id: string }>(
      "select distinct owner_id from contacts",
    );
    expect(contactOwners).toEqual([{ owner_id: owner.id }]);
    const groupOwners = await query<{ owner_id: string }>("select distinct owner_id from groups");
    expect(groupOwners).toEqual([{ owner_id: owner.id }]);
  });

  it("loses no contacts, notes, groups or memberships", async () => {
    await seedOldData();

    await runMigrations({
      connectionString: migrationDatabaseUrl,
      migrationsFolder: "drizzle",
      ownerEmail: "owner@example.com",
    });

    expect(await count("contacts")).toBe(3);
    expect(await count("notes")).toBe(3);
    expect(await count("groups")).toBe(2);
    expect(await count("contact_groups")).toBe(3);
    // The keep-in-touch frequency survives too.
    const frequencies = await query<{ touch_frequency: string | null }>(
      "select touch_frequency from contacts order by id",
    );
    expect(frequencies.map((row) => row.touch_frequency)).toEqual(["month", null, "week"]);
  });

  it("creates exactly one user, so a friend who logs in later gets an empty list", async () => {
    await seedOldData();

    await runMigrations({
      connectionString: migrationDatabaseUrl,
      migrationsFolder: "drizzle",
      ownerEmail: "owner@example.com",
    });

    expect(await count("users")).toBe(1);
    const friendContacts = await query(
      "select * from contacts where owner_id not in (select id from users where email = 'owner@example.com')",
    );
    expect(friendContacts).toHaveLength(0);
  });

  it("stops without changing anything when data exists and the owner email is not set", async () => {
    await seedOldData();

    await expect(
      runMigrations({ connectionString: migrationDatabaseUrl, migrationsFolder: "drizzle" }),
    ).rejects.toThrow(/OWNER_EMAIL is not set/);

    // Schema and data are as before: no login tables, no owner columns, same rows, the migration is not recorded.
    const tables = await query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' and tablename = 'users'",
    );
    expect(tables).toHaveLength(0);
    const ownerColumns = await query(
      "select 1 from information_schema.columns where table_name = 'contacts' and column_name = 'owner_id'",
    );
    expect(ownerColumns).toHaveLength(0);
    expect(await count("contacts")).toBe(3);
    expect(await count("notes")).toBe(3);
    expect(await count("groups")).toBe(2);
    expect(await count("contact_groups")).toBe(3);
    const applied = await query<{ total: string }>(
      "select count(*) as total from drizzle.__drizzle_migrations",
    );
    expect(Number(applied[0].total)).toBe(3);
  });

  it("treats an empty owner email like a missing one when data exists", async () => {
    await seedOldData();

    await expect(
      runMigrations({
        connectionString: migrationDatabaseUrl,
        migrationsFolder: "drizzle",
        ownerEmail: "   ",
      }),
    ).rejects.toThrow(/OWNER_EMAIL is not set/);
    expect(await count("contacts")).toBe(3);
  });

  it("migrates an empty database without an owner email", async () => {
    await runMigrations({ connectionString: migrationDatabaseUrl, migrationsFolder: "drizzle" });

    expect(await count("users")).toBe(0);
    expect(await count("contacts")).toBe(0);
  });
});
