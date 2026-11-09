import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  appHeader,
  loginForm,
  requestLoginLink,
  signIn,
  submitLoginForm,
  uniqueEmail,
} from "./auth";
import {
  backdateLoginEmails,
  contactIdByName,
  countLoginEmails,
  createUser,
  expireLoginLinks,
  expireSessions,
  insertContacts,
  leaveSessionDays,
  resetDatabase,
  sessionSecondsLeft,
} from "./database";
import { buttonLinkOf, mailsTo, waitForMails } from "./mailpit";

// The scenarios of openspec/specs/login/spec.md. Emails go to Mailpit; a test reads its links from there.

const DAY_SECONDS = 24 * 60 * 60;
const TOO_OFTEN = "Слишком часто, попробуйте через несколько минут";
const WRONG_EMAIL = "Проверьте адрес почты";
const LINK_EXPIRED = "Ссылка устарела, запросите новую";

test.beforeEach(async () => {
  await resetDatabase();
});

function sentTo(email: string) {
  return `Ссылка для входа отправлена на ${email}`;
}

function contactList(page: Page) {
  return page.getByRole("region", { name: "Список контактов" });
}

async function expectLoginPage(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "Вход" })).toBeVisible();
  await expect(loginForm(page).email).toBeVisible();
  await expect(loginForm(page).submit).toBeVisible();
}

// Another browser: its own cookies and storage.
async function anotherBrowser(browser: Browser, headers: Record<string, string> = {}) {
  const context = await browser.newContext({ extraHTTPHeaders: headers });
  return { context, page: await context.newPage() };
}

test.describe("closed without a login", () => {
  test("opening the app without a login shows the login page, not the contacts", async ({
    page,
  }) => {
    const owner = await createUser(uniqueEmail("anna"));
    await insertContacts(owner, ["Анна Смирнова"]);

    await page.goto("/");

    await expectLoginPage(page);
    await expect(page.getByText("Анна Смирнова")).toBeHidden();
  });

  test("a direct link to a card, «Группы» or «Пора связаться» shows the login page", async ({
    page,
  }) => {
    const owner = await createUser(uniqueEmail("anna"));
    await insertContacts(owner, ["Анна Смирнова"]);
    const id = await contactIdByName("Анна Смирнова");

    for (const address of [`/contacts/${id}`, "/groups", "/keep-in-touch"]) {
      await page.goto(address);
      await expectLoginPage(page);
      await expect(page.getByText("Анна Смирнова")).toBeHidden();
    }
  });

  test("the server check works without a login", async ({ request }) => {
    const response = await request.get("/health");

    expect(response.ok()).toBe(true);
    expect(await response.json()).toMatchObject({ status: "ok" });
  });

  test("the login page leads a logged-in person to the contacts", async ({ page }) => {
    await signIn(page, uniqueEmail("anna"));

    await page.goto("/login");

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { level: 1, name: "Контакты" })).toBeVisible();
  });
});

test.describe("logging in by the link", () => {
  test("asking for a link: the page says it was sent and the email arrives", async ({ page }) => {
    const email = uniqueEmail("anna");
    await page.goto("/login");

    await submitLoginForm(page, email);

    await expect(page.getByText(sentTo(email))).toBeVisible();
    expect(await waitForMails(email, 1)).toHaveLength(1);
    // The field and the button stay, to ask once more.
    await expect(loginForm(page).email).toBeVisible();
    await expect(loginForm(page).submit).toBeVisible();
  });

  test("the link from the email lets the person in, and the header shows the email", async ({
    page,
  }) => {
    const email = uniqueEmail("anna");
    const owner = await createUser(email);
    await insertContacts(owner, ["Анна Смирнова"]);

    await signIn(page, email);

    await expect(contactList(page).getByRole("link", { name: /Анна Смирнова/ })).toBeVisible();
    await expect(appHeader(page)).toContainText(email);
  });

  test("the first login is a registration: no questions, an empty list", async ({ page }) => {
    await signIn(page, uniqueEmail("new"));

    await expect(page.getByText("Пока нет ни одного контакта")).toBeVisible();
  });

  test("spaces around the address and capital letters are dropped", async ({ page }) => {
    const email = uniqueEmail("anna");
    await page.goto("/login");

    await submitLoginForm(page, `  ${email.toUpperCase()}  `);

    await expect(page.getByText(sentTo(email))).toBeVisible();
    expect(await waitForMails(email, 1)).toHaveLength(1);
  });

  test("the same address in other letters is the same user", async ({ page }) => {
    const email = uniqueEmail("anna");
    await signIn(page, email);
    // A contact added in the app itself.
    await page.getByRole("link", { name: "Добавить контакт" }).first().click();
    await page.getByLabel("Имя").fill("Вера Климова");
    await page.getByRole("button", { name: "Добавить контакт" }).click();
    await expect(page).toHaveURL("/");
    await appHeader(page).getByRole("button", { name: "Выйти" }).click();

    await signIn(page, email.toUpperCase());

    await expect(contactList(page).getByRole("link", { name: /Вера Климова/ })).toBeVisible();
  });
});

test.describe("a wrong address", () => {
  for (const wrong of ["anna@", "anna"]) {
    test(`${wrong} is not an address: the error is under the field, the text stays, no email`, async ({
      page,
    }) => {
      await page.goto("/login");

      await submitLoginForm(page, wrong);

      await expect(page.getByText(WRONG_EMAIL)).toBeVisible();
      await expect(loginForm(page).email).toHaveValue(wrong);
      expect(await countLoginEmails(wrong)).toBe(0);
    });
  }

  for (const empty of ["", "   "]) {
    test(`an empty field (${JSON.stringify(empty)}) shows the error and sends nothing`, async ({
      page,
    }) => {
      await page.goto("/login");

      await submitLoginForm(page, empty);

      await expect(page.getByText(WRONG_EMAIL)).toBeVisible();
      await expect(page.getByText("Ссылка для входа отправлена")).toBeHidden();
    });
  }

  test("a known and a new address get the same answer, and both emails arrive", async ({
    page,
  }) => {
    const known = uniqueEmail("known");
    const stranger = uniqueEmail("new");
    await createUser(known);
    await page.goto("/login");

    await submitLoginForm(page, known);
    await expect(page.getByText(sentTo(known))).toBeVisible();
    await submitLoginForm(page, stranger);
    await expect(page.getByText(sentTo(stranger))).toBeVisible();

    expect(await waitForMails(known, 1)).toHaveLength(1);
    expect(await waitForMails(stranger, 1)).toHaveLength(1);
  });
});

test.describe("the link works once and for 15 minutes", () => {
  test("the second time it leads to «Ссылка устарела»", async ({ page }) => {
    const email = uniqueEmail("anna");
    const link = await requestLoginLink(page, email);
    await page.goto(link);
    await expect(page).toHaveURL("/");
    await appHeader(page).getByRole("button", { name: "Выйти" }).click();

    await page.goto(link);

    await expect(page.getByText(LINK_EXPIRED)).toBeVisible();
    await expect(page.getByRole("link", { name: "Запросить новую ссылку" })).toBeVisible();
    await page.goto("/");
    await expectLoginPage(page);
  });

  test("after 15 minutes it does not let in", async ({ page }) => {
    const email = uniqueEmail("anna");
    const link = await requestLoginLink(page, email);
    await expireLoginLinks(email);

    await page.goto(link);

    await expect(page.getByText(LINK_EXPIRED)).toBeVisible();
    await page.goto("/");
    await expectLoginPage(page);
  });

  test("a newer link cancels the older one", async ({ page }) => {
    const email = uniqueEmail("anna");
    const first = await requestLoginLink(page, email);
    const second = await requestLoginLink(page, email);

    await page.goto(first);
    await expect(page.getByText(LINK_EXPIRED)).toBeVisible();

    await page.goto(second);
    await expect(page).toHaveURL("/");
  });

  test("«Запросить новую ссылку» leads to the login page", async ({ page }) => {
    const email = uniqueEmail("anna");
    const link = await requestLoginLink(page, email);
    await expireLoginLinks(email);
    await page.goto(link);

    await page.getByRole("link", { name: "Запросить новую ссылку" }).click();

    await expect(page).toHaveURL("/login");
    await expect(loginForm(page).email).toBeVisible();
  });
});

test.describe("limits of emails", () => {
  // Three requests one after another; each is waited for in the mailbox, so the next one never overtakes it.
  async function askThreeTimes(page: Page, email: string) {
    await page.goto("/login");
    for (let attempt = 1; attempt <= 3; attempt++) {
      await submitLoginForm(page, email);
      await waitForMails(email, attempt);
    }
  }

  test("the fourth request for an address in 10 minutes is refused, no fourth email", async ({
    page,
  }) => {
    const email = uniqueEmail("anna");
    await askThreeTimes(page, email);

    await submitLoginForm(page, email);

    await expect(page.getByText(TOO_OFTEN)).toBeVisible();
    expect(await mailsTo(email)).toHaveLength(3);
  });

  test("after 10 minutes the address can ask again", async ({ page }) => {
    const email = uniqueEmail("anna");
    await askThreeTimes(page, email);
    await backdateLoginEmails(11);

    await submitLoginForm(page, email);

    await expect(page.getByText(sentTo(email))).toBeVisible();
    expect(await waitForMails(email, 4)).toHaveLength(4);
  });

  test("another address is not stopped", async ({ page }) => {
    const email = uniqueEmail("anna");
    const other = uniqueEmail("boris");
    await askThreeTimes(page, email);

    await submitLoginForm(page, other);

    await expect(page.getByText(sentTo(other))).toBeVisible();
    expect(await waitForMails(other, 1)).toHaveLength(1);
  });

  test("wrong addresses do not use up the limit", async ({ page }) => {
    const email = uniqueEmail("anna");
    for (let attempt = 0; attempt < 3; attempt++) {
      // A fresh page each time, so the error of the earlier try cannot be mistaken for the new one.
      await page.goto("/login");
      await submitLoginForm(page, "anna@");
      await expect(page.getByText(WRONG_EMAIL)).toBeVisible();
    }

    await page.goto("/login");
    await submitLoginForm(page, email);

    await expect(page.getByText(sentTo(email))).toBeVisible();
  });

  async function tenDifferentAddresses(page: Page) {
    await page.goto("/login");
    for (let index = 1; index <= 10; index++) {
      const email = uniqueEmail(`person${index}`);
      await submitLoginForm(page, email);
      await expect(page.getByText(sentTo(email))).toBeVisible();
    }
  }

  test("the eleventh email in an hour from one internet address is refused", async ({ page }) => {
    await tenDifferentAddresses(page);
    const eleventh = uniqueEmail("person11");

    await submitLoginForm(page, eleventh);

    await expect(page.getByText(TOO_OFTEN)).toBeVisible();
    expect(await mailsTo(eleventh)).toHaveLength(0);
  });

  test("after an hour the same internet address can ask again", async ({ page }) => {
    await tenDifferentAddresses(page);
    await backdateLoginEmails(61);
    const next = uniqueEmail("person11");

    await submitLoginForm(page, next);

    await expect(page.getByText(sentTo(next))).toBeVisible();
  });

  test("another internet address is not stopped", async ({ page, browser }) => {
    await tenDifferentAddresses(page);
    const next = uniqueEmail("person11");
    const { context, page: elsewhere } = await anotherBrowser(browser, {
      "x-forwarded-for": "203.0.113.9",
    });
    try {
      await elsewhere.goto("/login");

      await submitLoginForm(elsewhere, next);

      await expect(elsewhere.getByText(sentTo(next))).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

test.describe("how long the login lasts", () => {
  test("after the browser is closed and opened again the person is still inside", async ({
    page,
    context,
  }) => {
    const email = uniqueEmail("anna");
    await signIn(page, email);

    // The cookie is not a session one: it has an expiry date about 30 days ahead, so the browser keeps it.
    const cookie = (await context.cookies()).find((item) => item.name.includes("session_token"));
    expect(cookie).toBeDefined();
    expect(cookie!.expires).toBeGreaterThan(Date.now() / 1000 + 29 * DAY_SECONDS);

    const reopened = await context.newPage();
    await reopened.goto("/");
    await expect(reopened.getByRole("heading", { level: 1, name: "Контакты" })).toBeVisible();
  });

  test("every visit moves the end of the login to 30 days from now", async ({ page }) => {
    const email = uniqueEmail("anna");
    await signIn(page, email);
    // As if the login was made 25 days ago.
    await leaveSessionDays(email, 5);

    await page.goto("/");

    await expect
      .poll(async () => Math.round(((await sessionSecondsLeft(email)) ?? 0) / DAY_SECONDS))
      .toBe(30);
  });

  test("after more than 30 days without a visit the login page opens", async ({ page }) => {
    const email = uniqueEmail("anna");
    await signIn(page, email);
    await expireSessions(email);

    await page.goto("/");

    await expectLoginPage(page);
  });

  test("two browsers at once see the same contacts", async ({ page, browser }) => {
    const email = uniqueEmail("anna");
    const owner = await createUser(email);
    await insertContacts(owner, ["Анна Смирнова"]);
    await signIn(page, email);
    const { context, page: second } = await anotherBrowser(browser);
    try {
      await signIn(second, email);

      for (const current of [page, second]) {
        await current.goto("/");
        await expect(
          contactList(current).getByRole("link", { name: /Анна Смирнова/ }),
        ).toBeVisible();
      }
    } finally {
      await context.close();
    }
  });
});

test.describe("the header", () => {
  test("shows the email and «Выйти» on every page after the login", async ({ page }) => {
    const email = uniqueEmail("anna");
    const owner = await createUser(email);
    await insertContacts(owner, ["Анна Смирнова"]);
    const id = await contactIdByName("Анна Смирнова");
    await signIn(page, email);

    for (const address of ["/", `/contacts/${id}`, "/groups", "/keep-in-touch"]) {
      await page.goto(address);
      await expect(appHeader(page)).toContainText(email);
      await expect(appHeader(page).getByRole("button", { name: "Выйти" })).toBeVisible();
    }
  });

  test("has only the name on the login page", async ({ page }) => {
    await page.goto("/login");

    await expect(appHeader(page)).toHaveText("Личная CRM");
    await expect(page.getByRole("button", { name: "Выйти" })).toBeHidden();
  });

  test("on a phone the name, the email and «Выйти» fit without overlapping", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const email = uniqueEmail("a-very-long-address-for-a-narrow-phone-screen");
    await signIn(page, email);

    const name = await appHeader(page).getByRole("link", { name: "Личная CRM" }).boundingBox();
    const address = await appHeader(page).getByText(email).boundingBox();
    const logout = await appHeader(page).getByRole("button", { name: "Выйти" }).boundingBox();
    expect(name && address && logout).toBeTruthy();

    // No two of them overlap on the line, and nothing sticks out of the screen.
    expect(name!.x + name!.width).toBeLessThanOrEqual(address!.x + 0.5);
    expect(address!.x + address!.width).toBeLessThanOrEqual(logout!.x + 0.5);
    expect(logout!.x + logout!.width).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      375,
    );
    // «Выйти» is on one line.
    expect(logout!.height).toBeLessThan(40);
  });
});

test.describe("logging out", () => {
  test("«Выйти» opens the login page, and the app stays closed", async ({ page }) => {
    await signIn(page, uniqueEmail("anna"));

    await appHeader(page).getByRole("button", { name: "Выйти" }).click();

    await expect(page).toHaveURL("/login");
    await expectLoginPage(page);
    await page.goto("/");
    await expectLoginPage(page);
  });

  test("another browser stays inside", async ({ page, browser }) => {
    const email = uniqueEmail("anna");
    await signIn(page, email);
    const { context, page: second } = await anotherBrowser(browser);
    try {
      await signIn(second, email);

      await appHeader(page).getByRole("button", { name: "Выйти" }).click();
      await expect(page).toHaveURL("/login");

      await second.goto("/");
      await expect(second.getByRole("heading", { level: 1, name: "Контакты" })).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

test.describe("the email", () => {
  test("is from «Личная CRM» with the subject, the button and the notes of the spec", async ({
    page,
  }) => {
    const email = uniqueEmail("anna");
    await requestLoginLink(page, email);

    const [mail] = await mailsTo(email);

    expect(mail.fromName).toBe("Личная CRM");
    expect(mail.fromAddress).toBe("noreply@mail.therooks.ru");
    expect(mail.subject).toBe("Вход в Личную CRM");
    expect(mail.html).toContain("Войти");
    expect(mail.html).toContain("Ссылка работает 15 минут.");
    expect(mail.html).toContain("Если вы не запрашивали вход — просто проигнорируйте письмо");
  });

  test("the «Войти» button lets the person in", async ({ page }) => {
    const email = uniqueEmail("anna");
    await requestLoginLink(page, email);
    const [mail] = await mailsTo(email);

    await page.goto(buttonLinkOf(mail));

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { level: 1, name: "Контакты" })).toBeVisible();
  });
});
