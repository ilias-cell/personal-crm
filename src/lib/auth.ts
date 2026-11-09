import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";

import { db } from "@/db";
import * as schema from "@/db/schema";
import { buildLoginEmail } from "@/lib/login-email";
import {
  EMAIL_SEND_FAILED_MESSAGE,
  INVALID_EMAIL_MESSAGE,
  TOO_MANY_LOGIN_EMAILS_MESSAGE,
} from "@/lib/login-form";
import { revokeLoginLinks } from "@/lib/login-links";
import { reserveLoginEmail } from "@/lib/login-limits";
import { describeMailError, sendMail } from "@/lib/mailer";
import { loginEmailSchema } from "@/lib/validation";

const DAY_SECONDS = 24 * 60 * 60;

export const INVALID_EMAIL_CODE = "INVALID_EMAIL";
export const TOO_MANY_LOGIN_EMAILS_CODE = "TOO_MANY_LOGIN_EMAILS";
export const EMAIL_SEND_FAILED_CODE = "EMAIL_SEND_FAILED";

// The internet address of the sender. nginx puts it in X-Forwarded-For, overwriting what the client sent,
// so the header holds one address. Without it (locally, in tests) the address is unknown.
function internetAddressOf(headers: Headers | undefined): string | null {
  const first = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first ? first : null;
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
  // The secret (BETTER_AUTH_SECRET) and the address of the app (BETTER_AUTH_URL) are read from the environment.
  // A login lasts 30 days from the last visit; it is moved forward on a visit if an hour has passed since the last move.
  session: { expiresIn: 30 * DAY_SECONDS, updateAge: 60 * 60 },
  // The limits of the app (see login-limits.ts) replace the built-in ones: those count in memory,
  // forget everything on restart, and would block many tests that run from one address.
  rateLimit: { enabled: false },
  hooks: {
    // Every check of a login request lives here, so it works for the form and for a request straight to the server,
    // and it runs before the link is written and before the email is sent.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/magic-link") return;

      const parsed = loginEmailSchema.safeParse(
        (ctx.body as { email?: unknown } | undefined)?.email,
      );
      if (!parsed.success) {
        throw new APIError("BAD_REQUEST", {
          code: INVALID_EMAIL_CODE,
          message: INVALID_EMAIL_MESSAGE,
        });
      }
      const email = parsed.data;

      if (!(await reserveLoginEmail(email, internetAddressOf(ctx.headers)))) {
        throw new APIError("TOO_MANY_REQUESTS", {
          code: TOO_MANY_LOGIN_EMAILS_CODE,
          message: TOO_MANY_LOGIN_EMAILS_MESSAGE,
        });
      }

      // The new link is written after this hook, so it is not touched.
      await revokeLoginLinks(email);

      // Continue with the address in its normal form: no spaces, lower case.
      return { context: { ...ctx, body: { ...ctx.body, email } } };
    }),
  },
  plugins: [
    magicLink({
      expiresIn: 15 * 60,
      // The database keeps a fingerprint of the link, so a leaked copy of the database cannot log anyone in.
      storeToken: "hashed",
      sendMagicLink: async ({ email, url }) => {
        try {
          await sendMail({ to: email, ...buildLoginEmail(url) });
        } catch (error) {
          // Neither the address nor the link goes to the log.
          console.error("Failed to send the login email", describeMailError(error));
          throw new APIError("INTERNAL_SERVER_ERROR", {
            code: EMAIL_SEND_FAILED_CODE,
            message: EMAIL_SEND_FAILED_MESSAGE,
          });
        }
      },
    }),
    // Must be the last plugin: it passes the cookies of Better Auth on to Next.js in server actions.
    nextCookies(),
  ],
});
