"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  auth,
  EMAIL_SEND_FAILED_CODE,
  INVALID_EMAIL_CODE,
  TOO_MANY_LOGIN_EMAILS_CODE,
} from "@/lib/auth";
import {
  EMAIL_SEND_FAILED_MESSAGE,
  INVALID_EMAIL_MESSAGE,
  TOO_MANY_LOGIN_EMAILS_MESSAGE,
  type LoginFormState,
} from "@/lib/login-form";
import { loginEmailSchema } from "@/lib/validation";

function readEmail(formData: FormData): string {
  const value = formData.get("email");
  return typeof value === "string" ? value : "";
}

// Asks Better Auth for a login link. All checks (the address, the limits, cancelling the earlier links) live in
// the hook of Better Auth, so they are the same for this form and for a request that comes straight to the server;
// here the answer is only turned into words for the form.
export async function requestLoginLink(
  _previous: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const typed = readEmail(formData);
  const parsed = loginEmailSchema.safeParse(typed);
  if (!parsed.success) {
    return { email: typed, error: INVALID_EMAIL_MESSAGE, sentTo: null };
  }
  const email = parsed.data;

  try {
    await auth.api.signInMagicLink({
      body: { email, callbackURL: "/", errorCallbackURL: "/login/expired" },
      headers: await headers(),
    });
  } catch (error) {
    const code = isAPIError(error)
      ? (error.body as { code?: string } | undefined)?.code
      : undefined;
    if (code === INVALID_EMAIL_CODE)
      return { email: typed, error: INVALID_EMAIL_MESSAGE, sentTo: null };
    if (code === TOO_MANY_LOGIN_EMAILS_CODE) {
      return { email, error: TOO_MANY_LOGIN_EMAILS_MESSAGE, sentTo: null };
    }
    if (code !== EMAIL_SEND_FAILED_CODE) {
      // The address is not written to the log.
      console.error("Failed to request a login link", { code });
    }
    return { email, error: EMAIL_SEND_FAILED_MESSAGE, sentTo: null };
  }

  return { email, error: null, sentTo: email };
}

// Ends the login of this device only; the other browsers of the person stay logged in.
export async function signOut(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
