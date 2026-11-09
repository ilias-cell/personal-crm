import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";

// Deletes the login links that are still waiting for this address, so only the newest link works.
// Better Auth keeps a link as a row of "verifications": the identifier starts with "magic-link:" and the value
// is JSON with the address. The CASE makes sure the JSON is read only in link rows.
// A test goes through the real login and fails if Better Auth ever changes this format.
export async function revokeLoginLinks(email: string): Promise<void> {
  await db.execute(sql`
    delete from verifications
    where case when identifier like 'magic-link:%' then value::jsonb ->> 'email' end = ${email}
  `);
}
