import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";

// Test databases live next to the working one, named "<name><suffix>", so working data is never touched.
// Vitest uses "_test", Playwright uses "_e2e": they can run at the same time without clearing each other's data.

export type TestDatabaseSuffix = "_test" | "_e2e";

function loadDatabaseUrl(): URL {
  // Test runners work outside Next.js, so .env is not loaded automatically.
  try {
    process.loadEnvFile(".env");
  } catch {
    // No .env file: rely on variables already present in the environment.
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }
  return new URL(databaseUrl);
}

export function databaseName(url: URL): string {
  return decodeURIComponent(url.pathname.slice(1));
}

// The connection string of the test database. Does not connect anywhere.
export function testDatabaseUrl(suffix: TestDatabaseSuffix): URL {
  const workingUrl = loadDatabaseUrl();
  const testUrl = new URL(workingUrl);
  const name = databaseName(workingUrl);
  testUrl.pathname = `/${encodeURIComponent(name.endsWith(suffix) ? name : name + suffix)}`;
  return testUrl;
}

export function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

// Connects to the "postgres" maintenance database, as createdb does: it exists on every server,
// while the database named in DATABASE_URL may itself be the test one that is not created yet.
async function createDatabaseIfMissing(name: string) {
  const serverUrl = loadDatabaseUrl();
  serverUrl.pathname = "/postgres";
  const client = new Client({
    connectionString: serverUrl.toString(),
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      "Cannot connect to the database. Start it with `docker compose up -d` and run the tests again.",
      { cause: error },
    );
  }
  try {
    const existing = await client.query("select 1 from pg_database where datname = $1", [name]);
    if (existing.rowCount === 0) {
      await client.query(`create database ${quoteIdentifier(name)}`);
    }
  } finally {
    await client.end();
  }
}

// Makes sure the test database exists and has the current schema. Returns its connection string.
export async function prepareTestDatabase(suffix: TestDatabaseSuffix): Promise<URL> {
  const testUrl = testDatabaseUrl(suffix);
  await createDatabaseIfMissing(databaseName(testUrl));

  const pool = new Pool({ connectionString: testUrl.toString(), max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  } finally {
    await pool.end();
  }
  return testUrl;
}
