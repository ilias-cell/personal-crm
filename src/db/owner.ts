// Finds or creates the owner of the demo data: the user with the email from OWNER_EMAIL.
// Plain code without the app's aliases: the seed is built apart from the app (see tsconfig.tools.json).

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { users, type User } from "./schema";

export async function findOrCreateOwner(
  db: NodePgDatabase,
  ownerEmail: string | undefined,
): Promise<User> {
  // The same form the app stores: no spaces around, lower case. So the owner who logs in later finds this user.
  const email = ownerEmail?.trim().toLowerCase();
  if (!email) {
    throw new Error("OWNER_EMAIL is not set: the demo contacts need an owner. Add it to .env.");
  }

  // The database decides who wins when two runs meet; the email is unique.
  await db
    .insert(users)
    .values({ id: randomUUID(), name: "", email, emailVerified: true })
    .onConflictDoNothing();
  const [owner] = await db.select().from(users).where(eq(users.email, email));
  return owner;
}
