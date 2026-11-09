import { randomUUID } from "node:crypto";

import { expect, type Page } from "@playwright/test";

import { loginLinkOf, mailsTo, waitForMails } from "./mailpit";

// Every test logs in under an address of its own, so tests never see each other's emails.
export function uniqueEmail(label = "user"): string {
  return `${label}-${randomUUID().slice(0, 8)}@example.com`;
}

export function loginForm(page: Page) {
  return {
    email: page.getByLabel("Почта"),
    submit: page.getByRole("button", { name: "Получить ссылку" }),
  };
}

// Fills the login form and presses «Получить ссылку». The page must already be the login page.
export async function submitLoginForm(page: Page, email: string) {
  const form = loginForm(page);
  await form.email.fill(email);
  await form.submit.click();
}

// Asks for a link on the login page and waits for the email. Gives back the link from the newest email.
export async function requestLoginLink(page: Page, email: string): Promise<string> {
  const before = (await mailsTo(email)).length;
  await page.goto("/login");
  await submitLoginForm(page, email);
  await expect(
    page.getByText(`Ссылка для входа отправлена на ${email.trim().toLowerCase()}`),
  ).toBeVisible();
  const [newest] = await waitForMails(email.trim().toLowerCase(), before + 1);
  return loginLinkOf(newest);
}

// A real login: the login page, the email in Mailpit, the link opened. Ends on the home page.
export async function signIn(page: Page, email: string) {
  const link = await requestLoginLink(page, email);
  await page.goto(link);
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { level: 1, name: "Контакты" })).toBeVisible();
}

// The header of the app (not the header of a page).
export function appHeader(page: Page) {
  return page.getByRole("banner");
}
