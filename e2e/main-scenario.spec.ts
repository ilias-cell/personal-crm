import { expect, test, type Page } from "@playwright/test";

import { insertContacts, resetDatabase } from "./database";

// The main scenario from specs/01-продуктовая-идея.md:
// open → see all contacts; add a contact → find it by name → add a note → the note stays in the card;
// the same address in another browser shows the same contacts.

test.beforeEach(async () => {
  await resetDatabase();
  await insertContacts(["Анна Смирнова", "Борис Петров"]);
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

  // Open: every contact is in the list.
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

  // Another browser (no shared cookies or storage) sees the same contacts and the same note.
  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage();
    await other.goto("/");
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
