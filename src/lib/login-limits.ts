import "server-only";

import { and, count, eq, gt, isNull, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import { loginEmails } from "@/db/schema";

// Limits on login emails, so the app cannot be used to flood other people's mailboxes.
export const MAX_EMAILS_PER_ADDRESS = 3;
export const ADDRESS_WINDOW_MINUTES = 10;
export const MAX_EMAILS_PER_IP = 10;
export const IP_WINDOW_MINUTES = 60;

// Writes down one more login email for this address and internet address, if the limits allow it.
// Returns false, and writes nothing, when the limit is reached. The email must already be validated and normalized.
//
// The count and the write happen in one transaction under advisory locks on the address and the internet address,
// so two requests at the same moment cannot both take the last free place.
// The time comes from the database clock, the same one that stamps the rows.
export async function reserveLoginEmail(email: string, ip: string | null): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Always the same order (address, then internet address): requests waiting for each other never deadlock.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`login-email:${email}`}, 0))`,
    );
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`login-ip:${ip ?? ""}`}, 0))`,
    );

    // Nothing older than the longest window is ever counted, so it is not kept.
    await tx
      .delete(loginEmails)
      .where(lt(loginEmails.createdAt, sql`now() - make_interval(mins => ${IP_WINDOW_MINUTES})`));

    const [sentToAddress] = await tx
      .select({ value: count() })
      .from(loginEmails)
      .where(
        and(
          eq(loginEmails.email, email),
          gt(loginEmails.createdAt, sql`now() - make_interval(mins => ${ADDRESS_WINDOW_MINUTES})`),
        ),
      );
    if (sentToAddress.value >= MAX_EMAILS_PER_ADDRESS) return false;

    // An unknown internet address (locally, in tests) is one shared counter.
    const [sentFromIp] = await tx
      .select({ value: count() })
      .from(loginEmails)
      .where(
        and(
          ip === null ? isNull(loginEmails.ip) : eq(loginEmails.ip, ip),
          gt(loginEmails.createdAt, sql`now() - make_interval(mins => ${IP_WINDOW_MINUTES})`),
        ),
      );
    if (sentFromIp.value >= MAX_EMAILS_PER_IP) return false;

    await tx.insert(loginEmails).values({ email, ip });
    return true;
  });
}
