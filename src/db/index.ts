import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

// Reuse one pool across hot reloads in development, otherwise every reload opens new connections.
const globalForDb = globalThis as unknown as { pgPool?: Pool };

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }
  const pool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000 });
  // Without a listener, an idle connection dropped by the database (for example on its restart) crashes the server.
  pool.on("error", (error) => {
    console.error("Unexpected database connection error", error);
  });
  return pool;
}

const pool = globalForDb.pgPool ?? createPool();
if (process.env.NODE_ENV !== "production") {
  globalForDb.pgPool = pool;
}

export const db = drizzle(pool, { schema });
