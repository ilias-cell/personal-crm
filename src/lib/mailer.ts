import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

// Sends emails through the SMTP server from SMTP_URL: Mailpit on the owner's computer and in tests,
// Resend on the server. The code is the same everywhere; only the settings differ.

let cached: { url: string; transport: Transporter } | undefined;

// One transport per SMTP address: it keeps its connections and is reused by every email.
function getTransport(): Transporter {
  const url = process.env.SMTP_URL;
  if (!url) {
    throw new Error("SMTP_URL is not set. Copy .env.example to .env and fill it in.");
  }
  if (cached?.url !== url) {
    cached = { url, transport: nodemailer.createTransport(url) };
  }
  return cached.transport;
}

export type Mail = { to: string; subject: string; html: string; text: string };

export async function sendMail({ to, subject, html, text }: Mail): Promise<void> {
  const from = process.env.MAIL_FROM;
  if (!from) {
    throw new Error("MAIL_FROM is not set. Copy .env.example to .env and fill it in.");
  }
  await getTransport().sendMail({ from, to, subject, html, text });
}

// What may go to the log when sending fails. The error message is left out on purpose:
// it can quote the recipient's address, and an address is personal data.
export function describeMailError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { type: typeof error };
  const { code, command, responseCode } = error as Error & {
    code?: unknown;
    command?: unknown;
    responseCode?: unknown;
  };
  return { name: error.name, code, command, responseCode };
}
