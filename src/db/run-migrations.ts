// Applies the migrations from the "drizzle" folder. Used by the deploy (tools/migrate.js), by "pnpm db:migrate"
// and by the test databases, so every way of migrating behaves the same.
//
// It uses ONE connection on purpose: the owner email is passed to the login migration (0003) as a session
// setting, and a setting lives only as long as its connection.

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

export type RunMigrationsOptions = {
  connectionString: string;
  migrationsFolder?: string;
  // Email of the owner of the data that existed before login. Needed only when the database already has contacts.
  ownerEmail?: string;
};

export async function runMigrations({
  connectionString,
  migrationsFolder = "drizzle",
  ownerEmail,
}: RunMigrationsOptions): Promise<void> {
  const client = new Client({ connectionString, connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    if (ownerEmail !== undefined) {
      await client.query("select set_config('crm.owner_email', $1, false)", [ownerEmail]);
    }
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
}
