import { expect, test, type Browser, type Page } from "@playwright/test";

import { MONTH_NAMES } from "../src/lib/contact-form";
import { ownerToday } from "../src/lib/birth-date";
import { signIn, uniqueEmail } from "./auth";
import {
  contactIdByName,
  createUser,
  groupIdByName,
  insertContactWith,
  insertContactWithBirthday,
  insertContacts,
  resetDatabase,
} from "./database";

// The scenarios of openspec/specs/birthdays/spec.md. Dates are counted from today on the Moscow calendar, the one
// the app uses. Borders a browser cannot move (29 February, the end of the year, midnight) are checked by Vitest.

const HINT =
  "Год можно не указывать. Если день рождения в ближайшие 7 дней, человек появится на главной в блоке «Скоро день рождения».";

// Every test logs in under an email of its own, and its data belongs to that user.
let email: string;
let ownerId: string;

test.beforeEach(async () => {
  await resetDatabase();
  email = uniqueEmail("owner");
  ownerId = await createUser(email);
});

// The birthday that is this many days from today (negative: in the past) and the year it falls in.
function inDays(days: number) {
  const today = ownerToday();
  const date = new Date(Date.UTC(today.year, today.month - 1, today.day + days));
  return { day: date.getUTCDate(), month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
}

// "14 марта", the way the app writes a date without a year.
function dateText({ day, month }: { day: number; month: number }) {
  const genitive = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return genitive.format(new Date(Date.UTC(2000, month - 1, day)));
}

function contactList(page: Page) {
  return page.getByRole("region", { name: "Список контактов" });
}

// The row of a contact card, e.g. "День рождения".
function cardRow(page: Page, label: string) {
  return page
    .locator("dl > div")
    .filter({ has: page.getByRole("term").filter({ hasText: label }) });
}

function birthdayBlock(page: Page) {
  return page.getByRole("region", { name: "Скоро день рождения" });
}

function birthdayRows(page: Page) {
  return birthdayBlock(page).getByRole("listitem");
}

async function openCard(page: Page, name: string) {
  await page.goto("/");
  await contactList(page)
    .getByRole("link", { name: new RegExp(name) })
    .click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

async function openEditForm(page: Page, name: string) {
  await openCard(page, name);
  await page.getByRole("link", { name: "Редактировать" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Редактирование контакта" }),
  ).toBeVisible();
}

type Birthday = { day?: string; month?: string; year?: string };

// Fills the birthday parts of an open form. A part that is not given is left alone; "" empties it.
async function fillBirthday(page: Page, { day, month, year }: Birthday) {
  if (day !== undefined) await page.getByLabel("День", { exact: true }).fill(day);
  if (month !== undefined) {
    await page
      .getByLabel("Месяц", { exact: true })
      .selectOption({ label: month === "" ? "Месяц" : month });
  }
  if (year !== undefined) await page.getByLabel("Год", { exact: true }).fill(year);
}

async function addContact(page: Page, name: string, birthday: Birthday) {
  await page.goto("/contacts/new");
  await page.getByLabel("Имя").fill(name);
  await fillBirthday(page, birthday);
  await page.getByRole("button", { name: "Добавить контакт" }).click();
}

test.describe("the field in the form and the row in the card", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, email);
  });

  test("is in both forms, with a hint", async ({ page }) => {
    await insertContacts(ownerId, ["Анна Смирнова"]);

    for (const open of [
      () => page.goto("/contacts/new"),
      () => openEditForm(page, "Анна Смирнова"),
    ]) {
      await open();
      await expect(page.locator("legend", { hasText: "День рождения" })).toBeVisible();
      await expect(page.getByLabel("День", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Месяц", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Год", { exact: true })).toBeVisible();
      await expect(page.getByText(HINT)).toBeVisible();
    }
  });

  test("lists the twelve months by name", async ({ page }) => {
    await page.goto("/contacts/new");

    const options = await page
      .getByLabel("Месяц", { exact: true })
      .locator("option")
      .allTextContents();

    expect(options).toEqual(["Месяц", ...MONTH_NAMES]);
  });

  test("saves a date with a year", async ({ page }) => {
    await addContact(page, "Анна Смирнова", { day: "14", month: "март", year: "1990" });
    await expect(page).toHaveURL("/");

    await openCard(page, "Анна Смирнова");
    await expect(cardRow(page, "День рождения")).toContainText("14 марта 1990");
  });

  test("saves a date without a year", async ({ page }) => {
    await addContact(page, "Анна Смирнова", { day: "14", month: "март" });
    await expect(page).toHaveURL("/");

    await openCard(page, "Анна Смирнова");
    await expect(cardRow(page, "День рождения")).toHaveText("День рождения14 марта");
  });

  test("is not required", async ({ page }) => {
    await addContact(page, "Анна Смирнова", {});
    await expect(page).toHaveURL("/");

    await openCard(page, "Анна Смирнова");
    await expect(cardRow(page, "День рождения")).toContainText("не указано");
  });

  test("says «не указано» in the card of a contact from before the feature", async ({ page }) => {
    await insertContacts(ownerId, ["Анна Смирнова"]);

    await openCard(page, "Анна Смирнова");
    await expect(cardRow(page, "День рождения")).toContainText("не указано");
  });

  test("stands in the card after the email and before «Как часто общаться»", async ({ page }) => {
    await insertContacts(ownerId, ["Анна Смирнова"]);

    await openCard(page, "Анна Смирнова");
    const labels = await page.getByRole("term").allTextContents();

    const email = labels.indexOf("Почта");
    expect(email).toBeGreaterThanOrEqual(0);
    expect(labels[email + 1]).toBe("День рождения");
    expect(labels[email + 2]).toBe("Как часто общаться");
  });

  test("changes when editing: the month is changed, the year is erased", async ({ page }) => {
    await insertContactWithBirthday(ownerId, "Анна Смирнова", { day: 14, month: 3, year: 1990 });
    await openEditForm(page, "Анна Смирнова");
    await expect(page.getByLabel("День", { exact: true })).toHaveValue("14");
    await expect(page.getByLabel("Месяц", { exact: true })).toHaveValue("3");
    await expect(page.getByLabel("Год", { exact: true })).toHaveValue("1990");

    await fillBirthday(page, { month: "апрель", year: "" });
    await page.getByRole("button", { name: "Сохранить" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Анна Смирнова" })).toBeVisible();
    await expect(cardRow(page, "День рождения")).toHaveText("День рождения14 апреля");
  });

  test("is removed by emptying the three parts", async ({ page }) => {
    await insertContactWithBirthday(ownerId, "Анна Смирнова", { day: 14, month: 3, year: 1990 });
    await openEditForm(page, "Анна Смирнова");

    await fillBirthday(page, { day: "", month: "", year: "" });
    await page.getByRole("button", { name: "Сохранить" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Анна Смирнова" })).toBeVisible();
    await expect(cardRow(page, "День рождения")).toContainText("не указано");
  });

  test("saves 29 February without a year", async ({ page }) => {
    await addContact(page, "Анна Смирнова", { day: "29", month: "февраль" });
    await expect(page).toHaveURL("/");

    await openCard(page, "Анна Смирнова");
    await expect(cardRow(page, "День рождения")).toHaveText("День рождения29 февраля");
  });
});

test.describe("the rules of input", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, email);
  });

  const nextYear = String(ownerToday().year + 1);

  const mistakes: [string, Birthday, string][] = [
    ["only the day", { day: "14" }, "Укажите день и месяц"],
    ["only the month", { month: "март" }, "Укажите день и месяц"],
    ["only the year", { year: "1990" }, "Укажите день и месяц"],
    ["31 April", { day: "31", month: "апрель" }, "Такой даты нет в календаре"],
    ["a day that is not a number", { day: "abc", month: "март" }, "День — число от 1 до 31"],
    ["day 0", { day: "0", month: "март" }, "День — число от 1 до 31"],
    ["day 32", { day: "32", month: "март" }, "День — число от 1 до 31"],
    [
      "29 February of 1991",
      { day: "29", month: "февраль", year: "1991" },
      "Такой даты нет в календаре",
    ],
    [
      "year 1850",
      { day: "14", month: "март", year: "1850" },
      "Год — четыре цифры, от 1900 до текущего",
    ],
    [
      "year 99",
      { day: "14", month: "март", year: "99" },
      "Год — четыре цифры, от 1900 до текущего",
    ],
    [
      "a year that is not a number",
      { day: "14", month: "март", year: "abc" },
      "Год — четыре цифры, от 1900 до текущего",
    ],
    [
      "a year after the current one",
      { day: "14", month: "март", year: nextYear },
      "Дата рождения не может быть в будущем",
    ],
  ];

  for (const [title, birthday, message] of mistakes) {
    test(`refuses ${title}`, async ({ page }) => {
      await addContact(page, "Анна Смирнова", birthday);

      await expect(page.getByText(message, { exact: true })).toBeVisible();
      await expect(page).toHaveURL("/contacts/new");
      // Nothing was saved.
      await page.goto("/");
      await expect(page.getByText("Пока нет ни одного контакта")).toBeVisible();
    });
  }

  test("refuses tomorrow of the current year", async ({ page }) => {
    const tomorrow = inDays(1);
    // Only when tomorrow is still this year; on 31 December it is January, a valid birthday of the past years.
    test.skip(tomorrow.year !== ownerToday().year, "tomorrow is in the next year");

    await addContact(page, "Анна Смирнова", {
      day: String(tomorrow.day),
      month: MONTH_NAMES[tomorrow.month - 1],
      year: String(tomorrow.year),
    });

    await expect(
      page.getByText("Дата рождения не может быть в будущем", { exact: true }),
    ).toBeVisible();
  });

  test("keeps what was typed and puts the cursor into the first part of the date", async ({
    page,
  }) => {
    await page.goto("/contacts/new");
    await page.getByLabel("Имя").fill("Анна Смирнова");
    await page.getByLabel("Телефон").fill("+7 900 000-00-00");
    await fillBirthday(page, { day: "31", month: "апрель" });
    await page.getByRole("button", { name: "Добавить контакт" }).click();

    await expect(page.getByText("Такой даты нет в календаре", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Имя")).toHaveValue("Анна Смирнова");
    await expect(page.getByLabel("Телефон")).toHaveValue("+7 900 000-00-00");
    await expect(page.getByLabel("День", { exact: true })).toHaveValue("31");
    await expect(page.getByLabel("Месяц", { exact: true })).toHaveValue("4");
    await expect(page.getByLabel("День", { exact: true })).toBeFocused();
  });

  test("can be corrected after a mistake", async ({ page }) => {
    await addContact(page, "Анна Смирнова", { day: "31", month: "апрель" });
    await expect(page.getByText("Такой даты нет в календаре", { exact: true })).toBeVisible();

    await fillBirthday(page, { day: "30" });
    await page.getByRole("button", { name: "Добавить контакт" }).click();

    await expect(page).toHaveURL("/");
    await openCard(page, "Анна Смирнова");
    await expect(cardRow(page, "День рождения")).toHaveText("День рождения30 апреля");
  });

  test("keeps the saved date when an edit with a mistake is refused", async ({ page }) => {
    await insertContactWithBirthday(ownerId, "Анна Смирнова", { day: 14, month: 3, year: 1990 });
    await openEditForm(page, "Анна Смирнова");

    await fillBirthday(page, { day: "31", month: "апрель" });
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Такой даты нет в календаре", { exact: true })).toBeVisible();

    await openCard(page, "Анна Смирнова");
    await expect(cardRow(page, "День рождения")).toContainText("14 марта 1990");
  });
});

test.describe("the block «Скоро день рождения» on the home page", () => {
  test("shows a person whose birthday is soon, and leads to the card", async ({ page }) => {
    await insertContactWithBirthday(ownerId, "Анна Смирнова", inDays(3));
    await signIn(page, email);

    await expect(birthdayBlock(page)).toBeVisible();
    await expect(
      birthdayBlock(page).getByRole("heading", { name: "Скоро день рождения" }),
    ).toBeVisible();
    await expect(birthdayRows(page)).toHaveCount(1);
    await expect(birthdayRows(page).first()).toContainText("Анна Смирнова");

    await birthdayRows(page).first().getByRole("link").click();
    await expect(page.getByRole("heading", { level: 1, name: "Анна Смирнова" })).toBeVisible();
  });

  test("stands above the search and the list", async ({ page }) => {
    await insertContactWithBirthday(ownerId, "Анна Смирнова", inDays(3));
    await signIn(page, email);

    const block = await birthdayBlock(page).boundingBox();
    const search = await page.getByRole("searchbox").boundingBox();
    const list = await contactList(page).boundingBox();
    expect(block!.y + block!.height).toBeLessThanOrEqual(search!.y);
    expect(search!.y).toBeLessThan(list!.y);
  });

  test("puts the nearest first, and writes when: today, tomorrow, in 2 days, in 5 days", async ({
    page,
  }) => {
    await insertContactWithBirthday(ownerId, "Борис", inDays(5));
    await insertContactWithBirthday(ownerId, "Вера", inDays(0));
    await insertContactWithBirthday(ownerId, "Глеб", inDays(2));
    await insertContactWithBirthday(ownerId, "Дина", inDays(1));
    await signIn(page, email);

    await expect(birthdayRows(page)).toHaveCount(4);
    for (const [index, name] of ["Вера", "Дина", "Глеб", "Борис"].entries()) {
      await expect(birthdayRows(page).nth(index)).toContainText(name);
    }
    await expect(birthdayRows(page).nth(0)).toContainText("Сегодня");
    await expect(birthdayRows(page).nth(1)).toContainText("Завтра");
    await expect(birthdayRows(page).nth(2)).toContainText("Через 2 дня");
    await expect(birthdayRows(page).nth(3)).toContainText("Через 5 дней");
  });

  test("puts people with one day by name", async ({ page }) => {
    await insertContactWithBirthday(ownerId, "Борис", inDays(4));
    await insertContactWithBirthday(ownerId, "Анна", inDays(4));
    await signIn(page, email);

    await expect(birthdayRows(page)).toHaveCount(2);
    await expect(birthdayRows(page).nth(0)).toContainText("Анна");
    await expect(birthdayRows(page).nth(1)).toContainText("Борис");
  });

  test("includes today and 6 days ahead, and leaves out 7 days ahead and yesterday", async ({
    page,
  }) => {
    await insertContactWithBirthday(ownerId, "Сегодняшний", inDays(0));
    await insertContactWithBirthday(ownerId, "Шестидневный", inDays(6));
    await insertContactWithBirthday(ownerId, "Семидневный", inDays(7));
    await insertContactWithBirthday(ownerId, "Вчерашний", inDays(-1));
    await signIn(page, email);

    await expect(birthdayRows(page)).toHaveCount(2);
    await expect(birthdayRows(page).nth(0)).toContainText("Сегодняшний");
    await expect(birthdayRows(page).nth(1)).toContainText("Шестидневный");
    await expect(birthdayRows(page).nth(1)).toContainText("Через 6 дней");
    await expect(birthdayBlock(page)).not.toContainText("Семидневный");
    await expect(birthdayBlock(page)).not.toContainText("Вчерашний");
    // Both are still in the list below: only the block is cut by the window.
    await expect(contactList(page).getByRole("link", { name: /Семидневный/ })).toBeVisible();
  });

  test("writes the date, and the age when the year of birth is known", async ({ page }) => {
    const soon = inDays(3);
    await insertContactWithBirthday(ownerId, "Анна Смирнова", { ...soon, year: soon.year - 36 });
    await insertContactWithBirthday(ownerId, "Борис Орлов", { day: soon.day, month: soon.month });
    await signIn(page, email);

    const withYear = birthdayRows(page).filter({ hasText: "Анна Смирнова" });
    await expect(withYear).toContainText(dateText(soon));
    await expect(withYear).toContainText("исполняется 36");
    await expect(withYear).toContainText("Через 3 дня");

    const withoutYear = birthdayRows(page).filter({ hasText: "Борис Орлов" });
    await expect(withoutYear).toContainText(dateText(soon));
    await expect(withoutYear).not.toContainText("исполняется");
  });

  test("does not depend on the search", async ({ page }) => {
    await insertContactWithBirthday(ownerId, "Анна Смирнова", inDays(3));
    await insertContacts(ownerId, ["Борис Орлов"]);
    await signIn(page, email);

    await page.goto("/?q=Борис");

    await expect(birthdayRows(page)).toHaveCount(1);
    await expect(birthdayRows(page).first()).toContainText("Анна Смирнова");
    await expect(contactList(page).getByRole("link", { name: /Борис Орлов/ })).toBeVisible();
    await expect(contactList(page).getByRole("link", { name: /Анна Смирнова/ })).toBeHidden();
  });

  test("does not depend on the chosen group", async ({ page }) => {
    await insertContactWithBirthday(ownerId, "Анна Смирнова", inDays(3));
    await insertContactWith(ownerId, { name: "Борис Орлов", groups: ["Семья"] });
    await signIn(page, email);

    await page.goto(`/?group=${await groupIdByName("Семья")}`);

    await expect(birthdayRows(page)).toHaveCount(1);
    await expect(birthdayRows(page).first()).toContainText("Анна Смирнова");
    await expect(contactList(page).getByRole("link", { name: /Анна Смирнова/ })).toBeHidden();
  });

  test("is not on the second page of the list either", async ({ page }) => {
    await insertContactWithBirthday(ownerId, "Анна Смирнова", inDays(3));
    await insertContacts(
      ownerId,
      Array.from({ length: 60 }, (_, index) => `Человек ${String(index + 1).padStart(3, "0")}`),
    );
    await signIn(page, email);

    await page.goto("/?page=2");

    await expect(birthdayRows(page)).toHaveCount(1);
  });

  test("is gone when the date is removed", async ({ page }) => {
    await insertContactWithBirthday(ownerId, "Анна Смирнова", inDays(3));
    await signIn(page, email);
    await expect(birthdayBlock(page)).toBeVisible();

    await openEditForm(page, "Анна Смирнова");
    await fillBirthday(page, { day: "", month: "", year: "" });
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Анна Смирнова" })).toBeVisible();

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Контакты" })).toBeVisible();
    await expect(contactList(page).getByRole("link", { name: /Анна Смирнова/ })).toBeVisible();
    await expect(birthdayBlock(page)).toBeHidden();
  });

  test("appears after a contact with a near date is added", async ({ page }) => {
    await signIn(page, email);
    await expect(birthdayBlock(page)).toBeHidden();
    const soon = inDays(2);

    await addContact(page, "Анна Смирнова", {
      day: String(soon.day),
      month: MONTH_NAMES[soon.month - 1],
    });

    await expect(page).toHaveURL("/");
    await expect(birthdayRows(page)).toHaveCount(1);
    await expect(birthdayRows(page).first()).toContainText("Через 2 дня");
  });
});

test.describe("no birthdays, no block", () => {
  // Nothing of it on the page: no heading, no empty message, no gap.
  async function expectNoBlock(page: Page) {
    await expect(page.getByRole("heading", { level: 1, name: "Контакты" })).toBeVisible();
    await expect(page.getByText("Скоро день рождения")).toHaveCount(0);
    await expect(page.getByText(/никого нет/i)).toHaveCount(0);
  }

  test("when nobody has a date", async ({ page }) => {
    await insertContacts(ownerId, ["Анна Смирнова", "Борис Орлов"]);
    await signIn(page, email);

    await expectNoBlock(page);
    await expect(contactList(page).getByRole("link", { name: /Анна Смирнова/ })).toBeVisible();
  });

  test("when the birthdays are far away", async ({ page }) => {
    await insertContactWithBirthday(ownerId, "Анна Смирнова", inDays(7));
    await insertContactWithBirthday(ownerId, "Борис Орлов", inDays(-1));
    await signIn(page, email);

    await expectNoBlock(page);
  });

  test("when there are no contacts at all", async ({ page }) => {
    await signIn(page, email);

    await expectNoBlock(page);
    await expect(page.getByText("Пока нет ни одного контакта")).toBeVisible();
  });
});

test.describe("only the own contacts", () => {
  async function anotherBrowser(browser: Browser) {
    const context = await browser.newContext();
    return { context, page: await context.newPage() };
  }

  test("a birthday of another user is not in the block, and the card is not opened", async ({
    page,
    browser,
  }) => {
    const other = uniqueEmail("vera-owner");
    const otherId = await createUser(other);
    await insertContactWithBirthday(otherId, "Вера Климова", inDays(0));
    await insertContactWithBirthday(ownerId, "Глеб Орлов", inDays(1));
    const veraId = await contactIdByName("Вера Климова");

    await signIn(page, email);
    await expect(birthdayRows(page)).toHaveCount(1);
    await expect(birthdayBlock(page)).toContainText("Глеб Орлов");
    await expect(birthdayBlock(page)).not.toContainText("Вера Климова");
    await page.goto(`/contacts/${veraId}`);
    await expect(page.getByText("Здесь ничего нет", { exact: true })).toBeVisible();

    const { context, page: otherPage } = await anotherBrowser(browser);
    try {
      await signIn(otherPage, other);
      await expect(birthdayRows(otherPage)).toHaveCount(1);
      await expect(birthdayBlock(otherPage)).toContainText("Вера Климова");
      await expect(birthdayBlock(otherPage)).toContainText("Сегодня");
      await expect(birthdayBlock(otherPage)).not.toContainText("Глеб Орлов");
    } finally {
      await context.close();
    }
  });

  test("a user without own birthdays has no block while another one has it", async ({ page }) => {
    const otherId = await createUser(uniqueEmail("vera-owner"));
    await insertContactWithBirthday(otherId, "Вера Климова", inDays(0));
    await insertContacts(ownerId, ["Глеб Орлов"]);

    await signIn(page, email);

    await expect(page.getByRole("heading", { level: 1, name: "Контакты" })).toBeVisible();
    await expect(page.getByText("Скоро день рождения")).toHaveCount(0);
  });
});
