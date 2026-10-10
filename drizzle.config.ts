import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next.js, so .env is not loaded automatically.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on variables already present in the environment.
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl },
});
