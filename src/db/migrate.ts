// Applies pending database migrations from the "drizzle" folder: node tools/migrate.js
// The deploy runs this in a one-off container from the app image before the new app container starts.
// It writes to the same journal table as "pnpm db:migrate" (drizzle-kit), so both ways can be mixed.

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }

  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10000 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: process.env.MIGRATIONS_DIR ?? "drizzle" });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exitCode = 1;
});
