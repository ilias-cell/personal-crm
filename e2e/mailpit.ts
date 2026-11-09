// Reads the login emails from Mailpit, as a person would open them in a mailbox.
// Mailpit is never emptied: the unit tests may use it at the same time. A test always looks for its own address.

const MAILPIT_URL = "http://127.0.0.1:8025";

export type Mail = {
  subject: string;
  fromName: string;
  fromAddress: string;
  html: string;
  text: string;
};

type SearchResult = { messages: { ID: string }[] | null };
type Message = {
  Subject: string;
  From: { Name: string; Address: string };
  HTML: string;
  Text: string;
};

// The emails sent to this address, the newest first.
export async function mailsTo(email: string): Promise<Mail[]> {
  const query = encodeURIComponent(`to:"${email}"`);
  const found = await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`);
  if (!found.ok) {
    throw new Error(
      `Mailpit did not answer (${found.status}). Start it with \`docker compose up -d\`.`,
    );
  }
  const { messages } = (await found.json()) as SearchResult;

  const mails: Mail[] = [];
  for (const { ID } of messages ?? []) {
    const message = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${ID}`)).json()) as Message;
    mails.push({
      subject: message.Subject,
      fromName: message.From.Name,
      fromAddress: message.From.Address,
      html: message.HTML,
      text: message.Text,
    });
  }
  return mails;
}

// Waits until the address has at least this many emails.
export async function waitForMails(
  email: string,
  count: number,
  timeoutMs = 10_000,
): Promise<Mail[]> {
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

// The login link written out in the text version of the email.
export function loginLinkOf(mail: Mail): string {
  const link = mail.text.match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error("The email has no login link.");
  return link;
}

// The address behind the «Войти» button of the HTML version.
export function buttonLinkOf(mail: Mail): string {
  const href = mail.html.match(/<a [^>]*href="([^"]+)"[^>]*>\s*Войти\s*<\/a>/)?.[1];
  if (!href) throw new Error("The email has no «Войти» button.");
  return href.replaceAll("&amp;", "&");
}
