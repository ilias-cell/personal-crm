import { drizzle } from "drizzle-orm/node-postgres";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { users } from "@/db/schema";
import { insertUser } from "@/test/factories";

import { findOrCreateOwner } from "./owner";

// The seed uses its own connection without the schema, as the tools do; the tests do the same, on the test database.
const plainDb = () => drizzle(db.$client);

describe("the owner of the demo data", () => {
  it("is created from OWNER_EMAIL, written trimmed and in lower case", async () => {
    const owner = await findOrCreateOwner(plainDb(), "  Owner@Example.COM ");

    expect(owner.email).toBe("owner@example.com");
    expect(owner.emailVerified).toBe(true);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("is not created twice: the second call finds the same user", async () => {
    const first = await findOrCreateOwner(plainDb(), "owner@example.com");
    const second = await findOrCreateOwner(plainDb(), "OWNER@example.com ");

    expect(second.id).toBe(first.id);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("is the user who already exists, for example the one who logged in before", async () => {
    const existing = await insertUser("owner@example.com");

    const owner = await findOrCreateOwner(plainDb(), "Owner@Example.com");

    expect(owner.id).toBe(existing.id);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it.each([undefined, "", "   "])(
    "is not found without OWNER_EMAIL (%j): a clear error",
    async (missing) => {
      await expect(findOrCreateOwner(plainDb(), missing)).rejects.toThrow(/OWNER_EMAIL is not set/);
      expect(await db.select().from(users)).toHaveLength(0);
    },
  );
});
