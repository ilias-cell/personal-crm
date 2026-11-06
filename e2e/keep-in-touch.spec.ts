import { expect, test, type Page } from "@playwright/test";

import { formatOwnerDate } from "../src/lib/format";
import { insertContacts, insertContactWith, resetDatabase } from "./database";

// The main paths of "Пора связаться" from openspec/specs/keep-in-touch/spec.md.
// Counting the period by the calendar is checked by the unit tests: a browser cannot move "today".

const HINT = "Когда срок пройдёт, человек появится на странице «Пора связаться».";
const EXPLANATION =
  "С этими людьми вы не общались дольше, чем хотели. Сверху — у кого срок прошёл раньше всех.";

test.beforeEach(async () => {
  await resetDatabase();
});

function keepInTouchLink(page: Page) {
  return page.getByRole("link", { name: /^Пора связаться/ });
}

function contactList(page: Page) {
  return page.getByRole("region", { name: "Список контактов" });
}

function overdueRows(page: Page) {
  return page.getByRole("region", { name: "Кому пора связаться" }).getByRole("listitem");
}

// The row of a contact card, e.g. "Как часто общаться".
function cardRow(page: Page, label: string) {
  return page
    .locator("dl > div")
    .filter({ has: page.getByRole("term").filter({ hasText: label }) });
}

async function openCard(page: Page, name: string) {
  await page.goto("/");
  await contactList(page)
    .getByRole("link", { name: new RegExp(name) })
    .click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

async function editFrequency(page: Page, name: string, frequency: string) {
  await openCard(page, name);
  await page.getByRole("link", { name: "Редактировать" }).click();
  await expect(page.getByText(HINT)).toBeVisible();
  await page.getByLabel("Как часто общаться").selectOption({ label: frequency });
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

test("set up how often to keep in touch, from an empty page to new contacts", async ({ page }) => {
  // A contact from before the feature: no frequency.
  await insertContacts(["Анна Смирнова"]);

  // Nobody has a frequency: the link has no number, the page tells where to set it.
  await page.goto("/");
  await expect(keepInTouchLink(page)).toHaveText("Пора связаться");
  await keepInTouchLink(page).click();
  await expect(page).toHaveURL("/keep-in-touch");
  await expect(page.getByText("Пока ни для кого не задано, как часто общаться")).toBeVisible();
  await expect(
    page.getByText(
      "Откройте контакт, нажмите «Редактировать» и выберите в поле «Как часто общаться», например, «Раз в месяц». Когда срок пройдёт, человек появится здесь.",
    ),
  ).toBeVisible();
  await expect(page.getByText(EXPLANATION)).toBeHidden();

  // The «Все контакты» button of the empty page leads home.
  await page.locator('[data-slot="empty"]').getByRole("link", { name: "Все контакты" }).click();
  await expect(page).toHaveURL("/");
  await expect(contactList(page).getByRole("link", { name: /Анна Смирнова/ })).toBeVisible();

  // A new contact with a frequency: the card shows it, the person is not due yet.
  await page.getByRole("link", { name: "Добавить контакт" }).click();
  await expect(page.getByText(HINT)).toBeVisible();
  await expect(page.getByLabel("Как часто общаться")).toHaveValue("");
  await page.getByLabel("Имя").fill("Вера Климова");
  await page.getByLabel("Как часто общаться").selectOption({ label: "Раз в неделю" });
  await page.getByRole("button", { name: "Добавить контакт" }).click();
  await expect(page).toHaveURL("/");
  await openCard(page, "Вера Климова");
  await expect(cardRow(page, "Как часто общаться")).toContainText("Раз в неделю");

  await page.goto("/");
  await expect(keepInTouchLink(page)).toHaveText("Пора связаться");
  await keepInTouchLink(page).click();
  await expect(page.getByText("Со всеми на связи")).toBeVisible();
  await expect(
    page.getByText(
      "Ни у кого срок не прошёл. Когда кому-то пора будет написать, он появится здесь.",
    ),
  ).toBeVisible();
  await expect(page.getByText(EXPLANATION)).toBeHidden();
  await expect(page.getByRole("link", { name: /Вера Климова/ })).toBeHidden();

  // A new contact without touching the field: saved, no frequency.
  await page.goto("/");
  await page.getByRole("link", { name: "Добавить контакт" }).click();
  await page.getByLabel("Имя").fill("Глеб Орлов");
  await page.getByRole("button", { name: "Добавить контакт" }).click();
  await expect(page).toHaveURL("/");
  await openCard(page, "Глеб Орлов");
  await expect(cardRow(page, "Как часто общаться")).toContainText("не указано");

  // The contact from before the feature has no frequency either.
  await openCard(page, "Анна Смирнова");
  await expect(cardRow(page, "Как часто общаться")).toContainText("не указано");

  // «Не задано» removes the frequency.
  await editFrequency(page, "Вера Климова", "Не задано");
  await expect(cardRow(page, "Как часто общаться")).toContainText("не указано");
});

test("see whom to get in touch with, write a note, and the person leaves the page", async ({
  page,
  browser,
}) => {
  const { noteAt } = await insertContactWith({
    name: "Борис Петров",
    noteDaysAgo: 365,
    groups: ["Теннис", "Аналитики"],
  });
  await insertContactWith({
    name: "Вера Климова",
    touchFrequency: "week",
    touchRestartedDaysAgo: 10,
  });

  // A frequency for a person whose last note is a year old: overdue at once.
  await editFrequency(page, "Борис Петров", "Раз в месяц");
  await expect(cardRow(page, "Как часто общаться")).toContainText("Раз в месяц");

  await page.goto("/");
  await expect(keepInTouchLink(page)).toHaveText(/^Пора связаться\s*·\s*2$/);
  await keepInTouchLink(page).click();
  await expect(page).toHaveURL("/keep-in-touch");
  await expect(page.getByText(EXPLANATION)).toBeVisible();

  // The longest overdue first; groups as labels right after the frequency and the last note.
  await expect(overdueRows(page)).toHaveCount(2);
  const boris = overdueRows(page).nth(0);
  await expect(boris).toContainText("Борис Петров");
  await expect(boris).toContainText(/просрочено на \d+ дн/);
  await expect(boris).toContainText(
    new RegExp(
      `Раз в месяц · Последняя заметка: ${formatOwnerDate(noteAt!)}\\s*Аналитики\\s*Теннис`,
    ),
  );
  const vera = overdueRows(page).nth(1);
  await expect(vera).toContainText("Вера Климова");
  await expect(vera).toContainText("просрочено на 3 дня");
  await expect(vera).toHaveText(/Раз в неделю · заметок ещё нет$/);

  // Another browser sees the same people with the same periods.
  const rows = await overdueRows(page).allTextContents();
  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage();
    await other.goto("/keep-in-touch");
    await expect(overdueRows(other)).toHaveText(rows);
  } finally {
    await otherContext.close();
  }

  // A click opens the card; a note there takes the person off the page.
  await boris.click();
  await expect(page.getByRole("heading", { level: 1, name: "Борис Петров" })).toBeVisible();
  await page.getByLabel("Новая заметка").fill("Сыграли в теннис");
  await page.getByRole("button", { name: "Сохранить заметку" }).click();
  await expect(page.getByLabel("Новая заметка")).toHaveValue("");

  await page.goto("/keep-in-touch");
  await expect(overdueRows(page)).toHaveCount(1);
  await expect(overdueRows(page).first()).toContainText("Вера Климова");

  await page.goto("/");
  await expect(keepInTouchLink(page)).toHaveText(/^Пора связаться\s*·\s*1$/);
});
