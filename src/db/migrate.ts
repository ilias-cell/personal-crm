// Applies pending database migrations from the "drizzle" folder: node tools/migrate.js
// The deploy runs this in a one-off container from the app image before the new app container starts.
// "pnpm db:migrate" runs the same code, so both ways write to the same journal table.
// OWNER_EMAIL is needed once, when the database already holds contacts from before login existed.

import { runMigrations } from "./run-migrations";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }

  await runMigrations({
    connectionString,
    migrationsFolder: process.env.MIGRATIONS_DIR ?? "drizzle",
    ownerEmail: process.env.OWNER_EMAIL,
  });
  console.log("Migrations applied.");
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exitCode = 1;
});
