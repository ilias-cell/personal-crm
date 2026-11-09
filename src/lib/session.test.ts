import { sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { auth } from "@/lib/auth";
import { getCurrentUser, requireUser } from "@/lib/session";
import { signIn, uniqueEmail } from "@/test/auth";

// The only thing replaced: the request headers, which exist only inside a running Next.js.
// A test gives the headers of a real login (the cookie of a session made through the email link).
const { requestHeaders } = vi.hoisted(() => ({ requestHeaders: vi.fn() }));
vi.mock("next/headers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/headers")>()),
  headers: requestHeaders,
}));
// Redirecting needs a running Next.js too. The real one stops the code by throwing, and so does this.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect to ${url}`);
  },
}));

describe("the current user", () => {
  it("is nobody without a login", async () => {
    requestHeaders.mockResolvedValue(new Headers());

    expect(await getCurrentUser()).toBeNull();
    await expect(requireUser()).rejects.toThrow("redirect to /login");
  });

  it("is the user of the login, with the id and the email", async () => {
    const email = uniqueEmail("anna");
    const { headers } = await signIn(email);
    requestHeaders.mockResolvedValue(headers);
    const { rows } = await db.execute<{ id: string }>(
      sql`select id from users where email = ${email}`,
    );

    expect(await getCurrentUser()).toEqual({ id: rows[0].id, email });
    expect(await requireUser()).toEqual({ id: rows[0].id, email });
  });

  it("is nobody after the login was closed", async () => {
    const { headers } = await signIn(uniqueEmail("anna"));
    await auth.api.signOut({ headers });
    requestHeaders.mockResolvedValue(headers);

    expect(await getCurrentUser()).toBeNull();
    await expect(requireUser()).rejects.toThrow("redirect to /login");
  });
});
