import { expect, test, type Browser, type Page } from "@playwright/test";

import { appHeader, signIn, uniqueEmail } from "./auth";
import {
  contactIdByName,
  createUser,
  groupIdByName,
  insertContactWith,
  insertContacts,
  resetDatabase,
} from "./database";

// The scenarios of openspec/specs/data-ownership/spec.md: everybody sees and changes only their own data.
// The first test is the success criterion of specs/02-пользователи-вход.md, both ways, in two real browsers.

test.beforeEach(async () => {
  await resetDatabase();
});

function contactList(page: Page) {
  return page.getByRole("region", { name: "Список контактов" });
}

// Another browser: its own cookies and storage, so it is another person at another computer.
async function anotherBrowser(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

async function expectNothingHere(page: Page) {
  await expect(page.getByText("Здесь ничего нет", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Такой страницы или контакта не существует. Возможно, адрес набран с ошибкой."),
  ).toBeVisible();
  await expect(page).toHaveTitle(/Контакт не найден/);
}

async function addContact(page: Page, name: string) {
  await page.getByRole("link", { name: "Добавить контакт" }).first().click();
  await page.getByLabel("Имя").fill(name);
  await page.getByRole("button", { name: "Добавить контакт" }).click();
  await expect(page).toHaveURL("/");
  await expect(contactList(page).getByRole("link", { name: new RegExp(name) })).toBeVisible();
}

async function openCardFromList(page: Page, name: string): Promise<string> {
  await contactList(page)
    .getByRole("link", { name: new RegExp(name) })
    .click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return page.url();
}

test("two users do not see each other's data, both ways", async ({ page, browser }) => {
  const anna = uniqueEmail("anna");
  const boris = uniqueEmail("boris");
  const { context: borisContext, page: borisPage } = await anotherBrowser(browser);
  try {
    // A and B log in by the links from their emails, in two browsers.
    await signIn(page, anna);
    await signIn(borisPage, boris);

    // Each adds a contact through the app.
    await addContact(page, "Вера Климова");
    await addContact(borisPage, "Глеб Орлов");

    // Each sees their own contact, and the contact of the other is not in the list or in the search.
    await page.goto("/");
    await expect(contactList(page).getByRole("link", { name: /Вера Климова/ })).toBeVisible();
    await expect(page.getByText("Глеб Орлов")).toBeHidden();
    await expect(page.getByText("Всего: 1 контакт")).toBeVisible();
    await page.getByRole("searchbox", { name: "Поиск по имени" }).fill("орлов");
    await expect(page.getByText("Никого не нашлось")).toBeVisible();

    await borisPage.goto("/");
    await expect(contactList(borisPage).getByRole("link", { name: /Глеб Орлов/ })).toBeVisible();
    await expect(borisPage.getByText("Вера Климова")).toBeHidden();
    await borisPage.getByRole("searchbox", { name: "Поиск по имени" }).fill("климова");
    await expect(borisPage.getByText("Никого не нашлось")).toBeVisible();

    // By a direct link to the contact of the other: «Здесь ничего нет», the tab says «Контакт не найден».
    const annaCard = `/contacts/${await contactIdByName("Вера Климова")}`;
    const borisCard = `/contacts/${await contactIdByName("Глеб Орлов")}`;
    await borisPage.goto(annaCard);
    await expectNothingHere(borisPage);
    await expect(borisPage.getByText("Вера Климова")).toBeHidden();
    await page.goto(borisCard);
    await expectNothingHere(page);
    await expect(page.getByText("Глеб Орлов")).toBeHidden();
  } finally {
    await borisContext.close();
  }
});

test.describe("contacts", () => {
  test("a contact of another user is not in the list or the count, and the owner still sees it", async ({
    page,
    browser,
  }) => {
    const anna = uniqueEmail("anna");
    const annaId = await createUser(anna);
    await insertContacts(annaId, ["Вера Климова"]);
    const boris = uniqueEmail("boris");
    const borisId = await createUser(boris);
    await insertContacts(borisId, ["Глеб Орлов", "Дина Лаптева"]);

    await signIn(page, boris);
    await expect(page.getByText("Всего: 2 контакта")).toBeVisible();
    await expect(page.getByText("Вера Климова")).toBeHidden();
    await page.getByRole("searchbox", { name: "Поиск по имени" }).fill("климова");
    await expect(page.getByText("Никого не нашлось")).toBeVisible();

    // A logs in again in another browser and sees their own.
    const { context, page: annaPage } = await anotherBrowser(browser);
    try {
      await signIn(annaPage, anna);
      await expect(contactList(annaPage).getByRole("link", { name: /Вера Климова/ })).toBeVisible();
      await expect(annaPage.getByText("Глеб Орлов")).toBeHidden();
    } finally {
      await context.close();
    }
  });

  test("the card and the edit page of another user's contact look like a contact that does not exist", async ({
    page,
  }) => {
    const annaId = await createUser(uniqueEmail("anna"));
    await insertContacts(annaId, ["Вера Климова"]);
    const foreignId = await contactIdByName("Вера Климова");
    await signIn(page, uniqueEmail("boris"));

    await page.goto(`/contacts/${foreignId}`);
    await expectNothingHere(page);
    const foreignCard = await page.locator("main").innerText();

    await page.goto(`/contacts/${foreignId}/edit`);
    await expect(page.getByText("Здесь ничего нет", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Имя")).toBeHidden();

    // A number that nobody has gives exactly the same page.
    await page.goto(`/contacts/${foreignId + 1000}`);
    await expectNothingHere(page);
    expect(await page.locator("main").innerText()).toBe(foreignCard);
  });
});

test.describe("groups", () => {
  test("two users can both have a group with the same name", async ({ page }) => {
    const annaId = await createUser(uniqueEmail("anna"));
    await insertContactWith(annaId, { name: "Вера Климова", groups: ["Друзья"] });
    await signIn(page, uniqueEmail("boris"));

    await page.goto("/groups");
    await page.getByPlaceholder("Новая группа").fill("Друзья");
    await page.getByRole("button", { name: "Создать" }).click();

    await expect(page.getByRole("region", { name: "Список групп" })).toContainText("Друзья");
    await expect(page.getByText("Группа «Друзья» уже есть")).toBeHidden();
  });

  test("groups of another user are not shown: not on the page, not in the row of labels, not in «+ группа»", async ({
    page,
  }) => {
    const annaId = await createUser(uniqueEmail("anna"));
    await insertContactWith(annaId, { name: "Вера Климова", groups: ["Семья", "Теннис"] });
    const borisEmail = uniqueEmail("boris");
    const borisId = await createUser(borisEmail);
    await insertContacts(borisId, ["Глеб Орлов"]);
    await signIn(page, borisEmail);

    await page.goto("/groups");
    await expect(page.getByText("Пока нет ни одной группы")).toBeVisible();

    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Группы" })).toBeHidden();

    await openCardFromList(page, "Глеб Орлов");
    await page.getByRole("button", { name: "группа", exact: true }).click();
    const popup = page.getByRole("dialog", { name: "Добавить в группу" });
    await expect(popup.getByRole("list", { name: "Готовые группы" })).toBeHidden();
    await expect(popup.getByText("Семья")).toBeHidden();
  });

  test("the name of another user's group in «+ группа» creates an own group", async ({ page }) => {
    const annaId = await createUser(uniqueEmail("anna"));
    await insertContactWith(annaId, { name: "Вера Климова", groups: ["Теннис"] });
    const borisEmail = uniqueEmail("boris");
    const borisId = await createUser(borisEmail);
    await insertContacts(borisId, ["Глеб Орлов"]);
    await signIn(page, borisEmail);
    await openCardFromList(page, "Глеб Орлов");

    await page.getByRole("button", { name: "группа", exact: true }).click();
    const popup = page.getByRole("dialog", { name: "Добавить в группу" });
    await popup.getByPlaceholder("Новая группа").fill("Теннис");
    await popup.getByRole("button", { name: "Создать" }).click();

    await expect(page.getByRole("list", { name: "Группы контакта" })).toContainText("Теннис");
  });

  test("a group of another user in the address of the home page works as a group that does not exist", async ({
    page,
  }) => {
    const annaId = await createUser(uniqueEmail("anna"));
    await insertContactWith(annaId, { name: "Вера Климова", groups: ["Теннис"] });
    const foreignGroupId = await groupIdByName("Теннис");
    const borisEmail = uniqueEmail("boris");
    const borisId = await createUser(borisEmail);
    await insertContacts(borisId, ["Глеб Орлов"]);
    await signIn(page, borisEmail);

    await page.goto(`/?group=${foreignGroupId}`);

    await expect(contactList(page).getByRole("link", { name: /Глеб Орлов/ })).toBeVisible();
    await expect(page.getByText("Вера Климова")).toBeHidden();
    await expect(page.getByText("В группе")).toBeHidden();
  });
});

test.describe("keep in touch", () => {
  test("people of another user are not overdue for me", async ({ page, browser }) => {
    const anna = uniqueEmail("anna");
    const annaId = await createUser(anna);
    for (const name of ["Анна Смирнова", "Борис Петров", "Вера Климова"]) {
      await insertContactWith(annaId, { name, touchFrequency: "week", touchRestartedDaysAgo: 30 });
    }
    const borisEmail = uniqueEmail("boris");
    await createUser(borisEmail);

    const { context, page: annaPage } = await anotherBrowser(browser);
    try {
      await signIn(annaPage, anna);
      await expect(annaPage.getByRole("link", { name: /^Пора связаться/ })).toHaveText(
        /^Пора связаться\s*·\s*3$/,
      );
    } finally {
      await context.close();
    }

    await signIn(page, borisEmail);
    await expect(page.getByRole("link", { name: /^Пора связаться/ })).toHaveText("Пора связаться");
    await page.getByRole("link", { name: /^Пора связаться/ }).click();
    await expect(page.getByText("Пока ни для кого не задано, как часто общаться")).toBeVisible();
  });
});

test.describe("first login and the owner's data", () => {
  test("a newcomer starts with an empty list and an empty group page", async ({ page }) => {
    const annaId = await createUser(uniqueEmail("anna"));
    await insertContacts(annaId, ["Вера Климова"]);

    await signIn(page, uniqueEmail("newcomer"));

    await expect(page.getByText("Пока нет ни одного контакта")).toBeVisible();
    await expect(
      page.getByText("Добавьте первого человека, чтобы не потерять его из виду."),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Добавить контакт" }).last()).toBeVisible();
    await page.goto("/groups");
    await expect(page.getByText("Пока нет ни одной группы")).toBeVisible();
    await expect(appHeader(page)).toContainText("newcomer-");
  });

  test("a friend who logs in after the data was given to the owner sees an empty list", async ({
    page,
  }) => {
    const ownerId = await createUser(uniqueEmail("owner"));
    await insertContactWith(ownerId, { name: "Анна Смирнова", groups: ["Семья"] });

    await signIn(page, uniqueEmail("friend"));

    await expect(page.getByText("Пока нет ни одного контакта")).toBeVisible();
    await expect(page.getByText("Анна Смирнова")).toBeHidden();
  });
});
