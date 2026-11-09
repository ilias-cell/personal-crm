import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { reserveLoginEmail } from "@/lib/login-limits";

// Moves the sending time of the emails of one address back, as if they were sent that long ago.
async function moveBack(email: string, minutes: number) {
  await db.execute(
    sql`update login_emails set created_at = created_at - make_interval(mins => ${minutes}) where email = ${email}`,
  );
}

async function countRows(): Promise<number> {
  const { rows } = await db.execute<{ total: string }>(
    sql`select count(*) as total from login_emails`,
  );
  return Number(rows[0].total);
}

describe("limit of 3 emails per address in 10 minutes", () => {
  it("lets three through and refuses the fourth", async () => {
    const results = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      results.push(await reserveLoginEmail("anna@example.com", "1.1.1.1"));
    }

    expect(results).toEqual([true, true, true, false]);
  });

  it("does not count a refused attempt", async () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      await reserveLoginEmail("anna@example.com", "1.1.1.1");
    }

    expect(await countRows()).toBe(3);
  });

  it("lets the address through again when the first of the three is older than 10 minutes", async () => {
    await reserveLoginEmail("anna@example.com", "1.1.1.1");
    await moveBack("anna@example.com", 11);
    await reserveLoginEmail("anna@example.com", "1.1.1.1");
    await reserveLoginEmail("anna@example.com", "1.1.1.1");
    // Only two emails are inside the last 10 minutes now.
    expect(await reserveLoginEmail("anna@example.com", "1.1.1.1")).toBe(true);
    expect(await reserveLoginEmail("anna@example.com", "1.1.1.1")).toBe(false);
  });

  it("does not stop another address", async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      await reserveLoginEmail("anna@example.com", "1.1.1.1");
    }

    expect(await reserveLoginEmail("boris@example.com", "1.1.1.1")).toBe(true);
  });
});

describe("limit of 10 emails per internet address in an hour", () => {
  async function sendToTenAddresses(ip: string | null) {
    for (let index = 1; index <= 10; index++) {
      expect(await reserveLoginEmail(`person${index}@example.com`, ip)).toBe(true);
    }
  }

  it("refuses the eleventh email, whatever the addresses are", async () => {
    await sendToTenAddresses("1.1.1.1");

    expect(await reserveLoginEmail("person11@example.com", "1.1.1.1")).toBe(false);
  });

  it("lets the same internet address through again when the first email is older than an hour", async () => {
    await sendToTenAddresses("1.1.1.1");
    await moveBack("person1@example.com", 61);

    expect(await reserveLoginEmail("person11@example.com", "1.1.1.1")).toBe(true);
  });

  it("does not stop another internet address", async () => {
    await sendToTenAddresses("1.1.1.1");

    expect(await reserveLoginEmail("person11@example.com", "2.2.2.2")).toBe(true);
  });

  it("counts all requests with an unknown internet address together", async () => {
    await sendToTenAddresses(null);

    expect(await reserveLoginEmail("person11@example.com", null)).toBe(false);
    // An address that is known is not affected by the unknown ones.
    expect(await reserveLoginEmail("person11@example.com", "1.1.1.1")).toBe(true);
  });
});

describe("two attempts at the same moment", () => {
  it("lets only one through when one place is left for an email address", async () => {
    await reserveLoginEmail("anna@example.com", "1.1.1.1");
    await reserveLoginEmail("anna@example.com", "1.1.1.1");

    const results = await Promise.all([
      reserveLoginEmail("anna@example.com", "1.1.1.1"),
      reserveLoginEmail("anna@example.com", "1.1.1.1"),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await countRows()).toBe(3);
  });

  it("lets only one through when one place is left for an internet address", async () => {
    for (let index = 1; index <= 9; index++) {
      await reserveLoginEmail(`person${index}@example.com`, "1.1.1.1");
    }

    const results = await Promise.all([
      reserveLoginEmail("first@example.com", "1.1.1.1"),
      reserveLoginEmail("second@example.com", "1.1.1.1"),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await countRows()).toBe(10);
  });
});

describe("old rows", () => {
  it("are deleted when a new email is written", async () => {
    await reserveLoginEmail("anna@example.com", "1.1.1.1");
    await moveBack("anna@example.com", 61);
    expect(await countRows()).toBe(1);

    await reserveLoginEmail("boris@example.com", "2.2.2.2");

    expect(await countRows()).toBe(1);
  });
});
