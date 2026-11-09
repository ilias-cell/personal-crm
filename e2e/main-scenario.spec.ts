import { expect, test, type Page } from "@playwright/test";

import { signIn, uniqueEmail } from "./auth";
import {
  createUser,
  groupIdByName,
  insertContacts,
  insertGroupWithPeople,
  resetDatabase,
} from "./database";

// The main scenario from specs/01-продуктовая-идея.md:
// log in → see all contacts; add a contact → find it by name → add a note → the note stays in the card;
// the same email in another browser shows the same contacts.
// Every test logs in under an email of its own, with its own contacts.

let ownerId: string;
let email: string;

test.beforeEach(async ({ page }) => {
  await resetDatabase();
  email = uniqueEmail("owner");
  ownerId = await createUser(email);
  await insertContacts(ownerId, ["Анна Смирнова", "Борис Петров"]);
  await signIn(page, email);
});

function contactList(page: Page) {
  return page.getByRole("region", { name: "Список контактов" });
}

function notesSection(page: Page) {
  return page.getByRole("region", { name: "Заметки" });
}

test("add a contact, find it, write a note, see it in another browser", async ({
  page,
  browser,
}) => {
  const newName = "Вера Климова";
  const note = "Договорились созвониться в пятницу насчёт поездки в Казань";

  // Open: every contact of the owner is in the list.
  await page.goto("/");
  await expect(page.getByText("Всего: 2 контакта")).toBeVisible();
  await expect(contactList(page).getByRole("link", { name: /Анна Смирнова/ })).toBeVisible();
  await expect(contactList(page).getByRole("link", { name: /Борис Петров/ })).toBeVisible();

  // Add a contact: it shows up first in the list.
  await page.getByRole("link", { name: "Добавить контакт" }).click();
  await page.getByLabel("Имя").fill(newName);
  await page.getByLabel("Кто это").fill("Однокурсница");
  await page.getByRole("button", { name: "Добавить контакт" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByText("Всего: 3 контакта")).toBeVisible();
  await expect(contactList(page).getByRole("listitem").first()).toContainText(newName);

  // Find it by name: only this person is left in the list.
  await page.getByRole("searchbox", { name: "Поиск по имени" }).fill("климова");
  await expect(page.getByText("Найдено: 1 из 3")).toBeVisible();
  await expect(contactList(page).getByRole("link")).toHaveCount(1);

  // Open the card and write a note.
  await contactList(page)
    .getByRole("link", { name: new RegExp(newName) })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: newName })).toBeVisible();
  await expect(notesSection(page).getByText("Заметок пока нет")).toBeVisible();

  await page.getByLabel("Новая заметка").fill(note);
  await page.getByRole("button", { name: "Сохранить заметку" }).click();

  await expect(notesSection(page).getByRole("listitem")).toHaveCount(1);
  await expect(notesSection(page).getByRole("listitem").first()).toContainText(note);
  await expect(page.getByLabel("Новая заметка")).toHaveValue("");

  // The note is saved: it is still in the card after a reload.
  await page.reload();
  await expect(notesSection(page).getByRole("listitem").first()).toContainText(note);
  const cardUrl = page.url();

  // Another browser (no shared cookies or storage), logged in under the same email, sees the same contacts and note.
  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage();
    await signIn(other, email);
    await expect(other.getByText("Всего: 3 контакта")).toBeVisible();
    for (const name of [newName, "Анна Смирнова", "Борис Петров"]) {
      await expect(contactList(other).getByRole("link", { name: new RegExp(name) })).toBeVisible();
    }

    await other.goto(cardUrl);
    await expect(other.getByRole("heading", { level: 1, name: newName })).toBeVisible();
    await expect(notesSection(other).getByRole("listitem").first()).toContainText(note);
  } finally {
    await otherContext.close();
  }
});

// The same address in another browser after logging in under the same email (openspec/specs/contact-list).
test("the address of the 3rd page opens the same page in another browser", async ({
  page,
  browser,
}) => {
  await insertGroupWithPeople(ownerId, "Все", "Человек", 120);
  await page.goto("/?page=3");
  await expect(contactList(page).getByRole("listitem").first()).toBeVisible();
  const names = await contactList(page).getByRole("listitem").allTextContents();

  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage();
    await signIn(other, email);
    await other.goto("/?page=3");

    await expect(contactList(other).getByRole("listitem")).toHaveText(names);
  } finally {
    await otherContext.close();
  }
});

test("the address with a group and the 2nd page opens the same people in another browser", async ({
  page,
  browser,
}) => {
  await insertGroupWithPeople(ownerId, "Работа", "Коллега", 70);
  const address = `/?group=${await groupIdByName("Работа")}&page=2`;
  await page.goto(address);
  await expect(
    page.getByRole("navigation", { name: "Группы" }).getByRole("link", { name: "Работа" }),
  ).toHaveAttribute("aria-current", "page");
  const people = contactList(page).getByRole("link", { name: /Коллега/ });
  const names = await people.allTextContents();
  expect(names).toHaveLength(20);

  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage();
    await signIn(other, email);
    await other.goto(address);

    await expect(
      other.getByRole("navigation", { name: "Группы" }).getByRole("link", { name: "Работа" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      other
        .getByRole("region", { name: "Список контактов" })
        .getByRole("link", { name: /Коллега/ }),
    ).toHaveText(names);
  } finally {
    await otherContext.close();
  }
});

// The same groups in another browser (openspec/specs/contact-groups).
test("the same groups with the same numbers in another browser", async ({ page, browser }) => {
  await insertGroupWithPeople(ownerId, "Теннис", "Игрок", 3);
  await page.goto("/groups");
  const groupsList = page.getByRole("region", { name: "Список групп" });
  await expect(groupsList).toContainText("Теннис");
  const shown = await groupsList.innerText();

  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage();
    await signIn(other, email);
    await other.goto("/groups");

    expect(await other.getByRole("region", { name: "Список групп" }).innerText()).toBe(shown);
  } finally {
    await otherContext.close();
  }
});
