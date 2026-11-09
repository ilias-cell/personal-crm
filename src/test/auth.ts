// Helpers for tests that go through the real login: the real Better Auth, the real database and the real Mailpit.
// Nothing here replaces the login; a test gets a session the same way a person does, by opening the link from the email.

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users, type User } from "@/db/schema";
import { auth } from "@/lib/auth";

const MAILPIT_URL = "http://127.0.0.1:8025";

export const BASE_URL = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3001";

export type CaughtMail = {
  id: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  html: string;
  text: string;
};

// Every test logs in under an address of its own, so tests never see each other's emails.
// Mailpit is not emptied: Vitest and Playwright may run at the same time.
export function uniqueEmail(label = "user"): string {
  return `${label}-${randomUUID().slice(0, 8)}@example.com`;
}

type MailpitSearchResult = { messages: { ID: string }[] | null };
type MailpitMessage = {
  ID: string;
  Subject: string;
  From: { Name: string; Address: string };
  HTML: string;
  Text: string;
};

// The emails sent to this address, the newest first.
export async function mailsTo(email: string): Promise<CaughtMail[]> {
  const query = encodeURIComponent(`to:"${email}"`);
  const found = await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`);
  if (!found.ok) {
    throw new Error(
      `Mailpit did not answer (${found.status}). Start it with \`docker compose up -d\`.`,
    );
  }
  const { messages } = (await found.json()) as MailpitSearchResult;

  const mails: CaughtMail[] = [];
  for (const { ID } of messages ?? []) {
    const message = (await (
      await fetch(`${MAILPIT_URL}/api/v1/message/${ID}`)
    ).json()) as MailpitMessage;
    mails.push({
      id: message.ID,
      subject: message.Subject,
      fromName: message.From.Name,
      fromAddress: message.From.Address,
      html: message.HTML,
      text: message.Text,
    });
  }
  return mails;
}

// Waits until the address has at least this many emails (the SMTP server accepts the email before it is searchable).
export async function waitForMails(
  email: string,
  count: number,
  timeoutMs = 5000,
): Promise<CaughtMail[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const mails = await mailsTo(email);
    if (mails.length >= count) return mails;
    if (Date.now() > deadline) {
      throw new Error(
        `Expected ${count} email(s) to ${email}, got ${mails.length} after ${timeoutMs} ms.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

// The login link of an email: the address on its own line in the text version.
export function loginLinkOf(mail: CaughtMail): string {
  const link = mail.text.match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error("The email has no login link.");
  return link;
}

// Asks for a login link the way the form does, and gives back the link from the email that arrived.
export async function requestLoginLink(email: string): Promise<string> {
  const before = (await mailsTo(email)).length;
  await auth.api.signInMagicLink({
    body: { email, callbackURL: "/", errorCallbackURL: "/login/expired" },
    headers: new Headers(),
  });
  const [newest] = await waitForMails(email, before + 1);
  return loginLinkOf(newest);
}

// The Cookie header that a browser would send after opening the response with these Set-Cookie headers.
function cookieHeaderOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

// A real login: link from the email, opened. Gives back the headers of a request from the logged-in browser.
export async function signIn(email: string): Promise<{ headers: Headers; cookie: string }> {
  const link = await requestLoginLink(email);
  const response = await auth.handler(new Request(link));
  const cookie = cookieHeaderOf(response);
  if (!cookie) throw new Error("Opening the login link did not log in.");
  return { headers: new Headers({ cookie }), cookie };
}

// A real login that also gives back the user row, for tests of what a logged-in person does.
export async function signInAs(
  email: string,
): Promise<{ user: User; headers: Headers; cookie: string }> {
  const session = await signIn(email);
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return { user, ...session };
}

// Opens a link and says where it leads and whether it logged in.
export async function openLink(
  link: string,
): Promise<{ location: string; loggedIn: boolean; cookie: string }> {
  const response = await auth.handler(new Request(link));
  const cookie = cookieHeaderOf(response);
  return { location: response.headers.get("location") ?? "", loggedIn: cookie !== "", cookie };
}

// A request for a login link that comes straight to the server, not from the form.
export function postMagicLink(
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return auth.handler(
    new Request(`${BASE_URL}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE_URL, ...headers },
      body: JSON.stringify(body),
    }),
  );
}
