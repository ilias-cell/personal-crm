import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import type { TestProject } from "vitest/node";

// Runs once before all tests: makes sure the test database exists and has the current schema.
// The tests use a database next to the working one, named "<name>_test", so working data is never touched.

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

const TEST_SUFFIX = "_test";

function loadDatabaseUrl(): URL {
  // Vitest runs outside Next.js, so .env is not loaded automatically.
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

function toTestDatabaseUrl(workingUrl: URL): URL {
  const testUrl = new URL(workingUrl);
  const name = decodeURIComponent(workingUrl.pathname.slice(1));
  testUrl.pathname = `/${encodeURIComponent(name.endsWith(TEST_SUFFIX) ? name : name + TEST_SUFFIX)}`;
  return testUrl;
}

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

async function createTestDatabaseIfMissing(workingUrl: URL, testName: string) {
  const client = new Client({ connectionString: workingUrl.toString(), connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      "Cannot connect to the database. Start it with `docker compose up -d` and run the tests again.",
      { cause: error },
    );
  }
  try {
    const existing = await client.query("select 1 from pg_database where datname = $1", [testName]);
    if (existing.rowCount === 0) {
      await client.query(`create database ${quoteIdentifier(testName)}`);
    }
  } finally {
    await client.end();
  }
}

export async function setup(project: TestProject) {
  const workingUrl = loadDatabaseUrl();
  const testUrl = toTestDatabaseUrl(workingUrl);
  const testName = decodeURIComponent(testUrl.pathname.slice(1));

  await createTestDatabaseIfMissing(workingUrl, testName);

  const pool = new Pool({ connectionString: testUrl.toString(), max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  } finally {
    await pool.end();
  }

  project.provide("testDatabaseUrl", testUrl.toString());
}
