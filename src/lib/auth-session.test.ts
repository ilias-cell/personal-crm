import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { auth } from "@/lib/auth";
import { BASE_URL, signIn, uniqueEmail } from "@/test/auth";

const DAY_SECONDS = 24 * 60 * 60;

// How many seconds from now the sessions of the address last: the one with the latest expiry.
async function secondsLeft(email: string): Promise<number | null> {
  const { rows } = await db.execute<{ seconds: number | null }>(sql`
    select extract(epoch from (max(s.expires_at) - now())) as seconds
    from sessions s join users u on u.id = s.user_id
    where u.email = ${email}
  `);
  return rows[0].seconds === null ? null : Number(rows[0].seconds);
}

// Makes the login look as if it was made so long ago that this many days are left.
async function leaveDays(email: string, days: number) {
  await db.execute(sql`
    update sessions set expires_at = now() + make_interval(days => ${days})
    where user_id = (select id from users where email = ${email})
  `);
}

// A visit as the browser makes it: the session check, a route handler of Better Auth.
function visit(cookie: string): Promise<Response> {
  return auth.handler(new Request(`${BASE_URL}/api/auth/get-session`, { headers: { cookie } }));
}

describe("how long the login lasts", () => {
  it("is 30 days after the login", async () => {
    const email = uniqueEmail("anna");

    await signIn(email);

    expect(Math.round((await secondsLeft(email))! / DAY_SECONDS)).toBe(30);
  });

  it("is moved to 30 days from now by a visit, in the database and in the cookie", async () => {
    const email = uniqueEmail("anna");
    const { cookie } = await signIn(email);
    // The login was made 25 days ago: 5 days are left.
    await leaveDays(email, 5);

    const response = await visit(cookie);

    expect(Math.abs((await secondsLeft(email))! - 30 * DAY_SECONDS)).toBeLessThan(60);
    const refreshedCookie = response.headers
      .getSetCookie()
      .find((value) => value.includes("session_token"));
    expect(refreshedCookie).toMatch(new RegExp(`Max-Age=${30 * DAY_SECONDS}`, "i"));
  });

  it("is not written again by a second visit within the hour", async () => {
    const email = uniqueEmail("anna");
    const { cookie } = await signIn(email);
    await leaveDays(email, 5);
    await visit(cookie);
    const afterFirst = await secondsLeft(email);

    const response = await visit(cookie);

    expect(await secondsLeft(email)).toBeCloseTo(afterFirst!, -1);
    expect(response.headers.getSetCookie().some((value) => value.includes("session_token"))).toBe(
      false,
    );
  });

  it("ends when the person has not visited for more than 30 days", async () => {
    const email = uniqueEmail("anna");
    const { headers } = await signIn(email);
    await db.execute(sql`update sessions set expires_at = now() - interval '1 second'`);

    expect(await auth.api.getSession({ headers })).toBeNull();
  });

  it("keeps the person in on two devices at once", async () => {
    const email = uniqueEmail("anna");

    const laptop = await signIn(email);
    const phone = await signIn(email);

    const { rows } = await db.execute<{ total: string }>(
      sql`select count(*) as total from sessions`,
    );
    expect(Number(rows[0].total)).toBe(2);
    expect((await auth.api.getSession({ headers: laptop.headers }))?.user.email).toBe(email);
    expect((await auth.api.getSession({ headers: phone.headers }))?.user.email).toBe(email);
  });
});

describe("logging out", () => {
  it("ends only the login of this device", async () => {
    const email = uniqueEmail("anna");
    const laptop = await signIn(email);
    const phone = await signIn(email);

    await auth.api.signOut({ headers: laptop.headers });

    expect(await auth.api.getSession({ headers: laptop.headers })).toBeNull();
    expect((await auth.api.getSession({ headers: phone.headers }))?.user.email).toBe(email);
  });
});
