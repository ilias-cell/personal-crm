// Fills an empty database with test contacts and notes: pnpm db:seed
// The data is generated from a fixed random seed, so every run produces the same people.
// Phones use the unassigned code 000 and emails use example.com, so nothing here can reach a real person.

import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { contacts, notes, type NewContact, type NewNote } from "./schema";

const CONTACT_COUNT = 1000;
const RANDOM_SEED = 20261010;
const HISTORY_DAYS = 3 * 365;
const DAY_MS = 24 * 60 * 60 * 1000;

const MALE_FIRST_NAMES = [
  "Александр", "Алексей", "Андрей", "Антон", "Артём", "Борис", "Вадим", "Валерий", "Василий", "Виктор",
  "Виталий", "Владимир", "Владислав", "Вячеслав", "Георгий", "Глеб", "Григорий", "Даниил", "Денис", "Дмитрий",
  "Евгений", "Егор", "Иван", "Игорь", "Илья", "Кирилл", "Константин", "Лев", "Леонид", "Максим",
  "Марк", "Матвей", "Михаил", "Никита", "Николай", "Олег", "Павел", "Пётр", "Роман", "Руслан",
  "Семён", "Сергей", "Станислав", "Степан", "Тимофей", "Тимур", "Фёдор", "Эдуард", "Юрий", "Ярослав",
];

const FEMALE_FIRST_NAMES = [
  "Александра", "Алина", "Алиса", "Алла", "Анастасия", "Ангелина", "Анна", "Валентина", "Валерия", "Вера",
  "Вероника", "Виктория", "Галина", "Дарья", "Диана", "Ева", "Евгения", "Екатерина", "Елена", "Елизавета",
  "Жанна", "Зоя", "Инна", "Ирина", "Карина", "Кира", "Кристина", "Ксения", "Лариса", "Лидия",
  "Любовь", "Людмила", "Маргарита", "Марина", "Мария", "Милана", "Надежда", "Наталья", "Нина", "Оксана",
  "Олеся", "Ольга", "Полина", "Светлана", "София", "Таисия", "Тамара", "Татьяна", "Ульяна", "Юлия",
];

// Masculine forms; the feminine form is derived in toFeminineLastName().
const LAST_NAMES = [
  "Иванов", "Смирнов", "Кузнецов", "Попов", "Васильев", "Петров", "Соколов", "Михайлов", "Новиков", "Фёдоров",
  "Морозов", "Волков", "Алексеев", "Лебедев", "Семёнов", "Егоров", "Павлов", "Козлов", "Степанов", "Николаев",
  "Орлов", "Андреев", "Макаров", "Никитин", "Захаров", "Зайцев", "Соловьёв", "Борисов", "Яковлев", "Григорьев",
  "Романов", "Воробьёв", "Сергеев", "Кузьмин", "Фролов", "Александров", "Дмитриев", "Королёв", "Гусев", "Киселёв",
  "Ильин", "Максимов", "Поляков", "Сорокин", "Виноградов", "Ковалёв", "Белов", "Медведев", "Антонов", "Тарасов",
  "Жуков", "Баранов", "Филиппов", "Комаров", "Давыдов", "Беляев", "Герасимов", "Богданов", "Осипов", "Сидоров",
  "Матвеев", "Титов", "Марков", "Миронов", "Крылов", "Куликов", "Карпов", "Власов", "Мельников", "Денисов",
  "Гаврилов", "Тихонов", "Казаков", "Афанасьев", "Данилов", "Савельев", "Тимофеев", "Фомин", "Чернов", "Абрамов",
  "Мартынов", "Ефимов", "Федотов", "Щербаков", "Назаров", "Калинин", "Исаев", "Чернышёв", "Быков", "Маслов",
  "Родионов", "Коновалов", "Лазарев", "Воронин", "Климов", "Филатов", "Пономарёв", "Голубев", "Кудрявцев", "Прохоров",
  "Наумов", "Потапов", "Журавлёв", "Овчинников", "Трофимов", "Леонов", "Соболев", "Ермаков", "Колесников", "Гончаров",
  "Емельянов", "Никифоров", "Грачёв", "Котов", "Гришин", "Ефремов", "Архипов", "Громов", "Кириллов", "Малышев",
  "Панов", "Моисеев", "Румянцев", "Акимов", "Кондратьев", "Бирюков", "Горбунов", "Анисимов", "Тихомиров", "Галкин",
  "Лукьянов", "Скворцов", "Юдин", "Белоусов", "Нестеров", "Симонов", "Харитонов", "Князев", "Цветков", "Воронов",
  "Белинский", "Высоцкий", "Жуковский", "Заболоцкий", "Каменский", "Крамской", "Левицкий", "Малиновский",
  "Островский", "Покровский", "Раевский", "Соколовский", "Чайковский", "Яблонский",
  "Шевченко", "Коваленко", "Бондаренко", "Ткаченко", "Кравченко", "Петренко", "Савченко", "Лысенко",
];

// [masculine, feminine] wording of "who this person is".
const ABOUT_BY_GENDER: [string, string][] = [
  ["Одноклассник", "Одноклассница"],
  ["Однокурсник", "Однокурсница"],
  ["Друг детства", "Подруга детства"],
  ["Школьный друг", "Школьная подруга"],
  ["Друг семьи", "Подруга семьи"],
  ["Бывший коллега", "Бывшая коллега"],
  ["Сосед по лестничной клетке", "Соседка по лестничной клетке"],
  ["Сосед по даче", "Соседка по даче"],
  ["Двоюродный брат", "Двоюродная сестра"],
  ["Троюродный брат", "Троюродная сестра"],
  ["Муж сестры", "Жена брата"],
  ["Крёстный дочери", "Крёстная дочери"],
  ["Папа Миши из садика", "Мама Миши из садика"],
  ["Папа Сони из класса", "Мама Сони из класса"],
  ["Учитель математики у сына", "Учительница математики у сына"],
  ["Напарник по теннису", "Напарница по теннису"],
  ["Знакомый по спортзалу", "Знакомая по спортзалу"],
  ["Попутчик из поезда", "Попутчица из поезда"],
  ["Владелец кофейни у дома", "Владелица кофейни у дома"],
  ["Массажист", "Массажистка"],
  ["Бывший начальник", "Бывшая начальница"],
  ["Знакомый из книжного клуба", "Знакомая из книжного клуба"],
];

const ABOUT_NEUTRAL = [
  "Стоматолог",
  "Семейный врач",
  "Ветеринар",
  "Юрист по недвижимости",
  "Нотариус",
  "Бухгалтер",
  "Риелтор",
  "Страховой агент",
  "Мастер по ремонту техники",
  "Репетитор по английскому",
  "Фотограф",
  "Дизайнер интерьеров",
  "Коллега из отдела маркетинга",
  "Коллега из бухгалтерии",
  "Коллега из соседнего отдела",
  "Руководитель проекта у заказчика",
  "Менеджер в банке",
  "Турагент",
  "Инструктор по вождению",
  "Тренер в фитнес-клубе",
  "Тренер по плаванию",
  "Парикмахер",
  "Психолог",
  "Архитектор",
  "Программист, помогает с сайтом",
  "Редактор в издательстве",
  "Организатор походов",
  "Экскурсовод",
  "Флорист",
  "Кондитер, делает торты на заказ",
  "Автомеханик из сервиса на Садовой",
  "Электрик",
  "Прораб, делал ремонт в квартире",
  "Председатель дачного товарищества",
  "Старший по дому",
];

const HOW_MET = [
  "Учились вместе в университете",
  "Учились в одной школе",
  "Работали вместе в одном отделе",
  "Бывшие коллеги по первой работе",
  "Познакомились на конференции в Казани",
  "Познакомились на свадьбе у друзей",
  "Познакомились на дне рождения у Кати",
  "Познакомились в походе на Алтае",
  "Познакомились в поезде Москва — Санкт-Петербург",
  "Познакомились на выставке",
  "Познакомились на курсах по фотографии",
  "Познакомились на мастер-классе по керамике",
  "Встретились на профессиональном митапе",
  "Через общих друзей",
  "Посоветовали знакомые",
  "Нашли по рекомендации соседей",
  "Соседи по дому",
  "Общий чат дома",
  "Дачный посёлок",
  "Родительский чат в школе",
  "Собачья площадка во дворе",
  "Вместе ходим в спортзал",
  "Играем в одной команде по волейболу",
  "Клуб настольных игр",
  "Курсы английского",
  "Автошкола",
  "Вместе были на стажировке",
  "Вместе снимали квартиру в студенчестве",
  "Отдыхали в одном отеле в Сочи",
  "Волонтёрили на одном фестивале",
  "Родственники со стороны жены",
  "Родственники со стороны мужа",
];

// Written without first-person past tense, so the notes fit a user of any gender.
const NOTE_TEMPLATES = [
  "Созвонились, договорились встретиться на следующей неделе.",
  "Встретились за кофе. Договорились: презентация должна уйти до пятницы.",
  "Обещаны контакты хорошего электрика — напомнить, если не придут до выходных.",
  "Договорились вернуться к разговору после отпуска.",
  "Обсудили ремонт на кухне. Нужно прислать размеры и фото.",
  "Договорились о встрече в субботу в 12:00, кафе у метро.",
  "Напомнить про документы для визы в начале месяца.",
  "Передали привет от общих знакомых. Договорились собраться всей компанией.",
  "Обсудили поездку на дачу на майские. Уточнить, кто берёт мангал.",
  "Вернуть книгу до конца месяца.",
  "Созвонились по поводу школы для детей. Список документов придёт на почту.",
  "Договорились: перезвонит после возвращения из командировки.",
  "Обсудили совместный проект. Следующий шаг — созвон в четверг.",
  "Поблагодарить за рекомендацию: мастер оказался отличным.",
  "Договорились сходить на выставку в следующем месяце.",
  "Обсудили покупку машины. Перед сделкой нужен осмотр — напомнить за пару дней.",
  "Обсудили страховку: расчёт придёт на почту.",
  "Долг 5 000 ₽ — договорились на возврат до 15-го числа.",
  "Просьба о совете по переезду. Отправить контакты перевозчика.",
  "Встретились случайно в магазине, обменялись новостями. Позвать в гости.",
  "Договорились о занятиях по вторникам и четвергам в 19:00.",
  "Приём назначен на понедельник, 10:30. Взять с собой снимки.",
  "Обсудили подарок на юбилей. Скидываемся по 2 000 ₽, собирает Оля.",
  "Жду ссылку на курс, о котором шла речь.",
  "Договорились вместе поехать на рыбалку в июне.",
  "Созвонились после долгого перерыва. Переезд в другой город — уточнить новый адрес.",
  "День рождения в конце месяца. Договорились увидеться в выходные после него.",
  "Обсудили отпуск: советуют ехать в сентябре, меньше людей и дешевле билеты.",
  "Итоги разговора:\n— смета будет к среде;\n— начало работ через две недели;\n— предоплата 30%.",
  "Договорились:\n1. Прислать паспортные данные.\n2. Подписать договор до конца недели.\n3. Созвониться после оплаты.",
];

const TRANSLITERATION: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

// Small deterministic generator (mulberry32): Math.random() cannot be seeded.
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = createRandom(RANDOM_SEED);

function randomInt(min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

function chance(probability: number): boolean {
  return random() < probability;
}

function toFeminineLastName(lastName: string): string {
  if (lastName.endsWith("ский") || lastName.endsWith("цкий")) return `${lastName.slice(0, -2)}ая`;
  if (lastName.endsWith("ской")) return `${lastName.slice(0, -2)}ая`;
  if (lastName.endsWith("енко")) return lastName;
  return `${lastName}а`;
}

function transliterate(text: string): string {
  return Array.from(text.toLowerCase(), (char) => TRANSLITERATION[char] ?? char).join("");
}

function digits(length: number): string {
  return Array.from({ length }, () => randomInt(0, 9)).join("");
}

function generateContacts(now: number): NewContact[] {
  // Sorted creation dates: the last inserted contact is also the most recently created one.
  const createdAtValues = Array.from({ length: CONTACT_COUNT }, () =>
    Math.round(now - DAY_MS - random() * HISTORY_DAYS * DAY_MS),
  ).sort((a, b) => a - b);

  const usedNames = new Set<string>();
  const usedEmails = new Set<string>();
  const result: NewContact[] = [];

  while (result.length < CONTACT_COUNT) {
    const isFemale = chance(0.5);
    const firstName = pick(isFemale ? FEMALE_FIRST_NAMES : MALE_FIRST_NAMES);
    const masculineLastName = pick(LAST_NAMES);
    const lastName = isFemale ? toFeminineLastName(masculineLastName) : masculineLastName;
    const name = `${firstName} ${lastName}`;
    if (usedNames.has(name)) continue;
    usedNames.add(name);

    let about: string | null = null;
    if (chance(0.88)) {
      about = chance(0.45) ? pick(ABOUT_BY_GENDER)[isFemale ? 1 : 0] : pick(ABOUT_NEUTRAL);
    }
    const howMet = chance(0.8) ? pick(HOW_MET) : null;
    const phone = chance(0.9) ? `+7 000 ${digits(3)}-${digits(2)}-${digits(2)}` : null;

    let email: string | null = null;
    if (chance(0.7)) {
      const base = `${transliterate(firstName)}.${transliterate(lastName)}`;
      email = `${base}@example.com`;
      for (let suffix = 2; usedEmails.has(email); suffix += 1) {
        email = `${base}${suffix}@example.com`;
      }
      usedEmails.add(email);
    }

    const createdAt = new Date(createdAtValues[result.length]);
    result.push({ name, about, howMet, phone, email, createdAt, updatedAt: createdAt });
  }

  return result;
}

function generateNotes(contactId: number, contactCreatedAt: Date, now: number): NewNote[] {
  if (!chance(0.65)) return [];

  const noteCount = randomInt(1, 4);
  const from = contactCreatedAt.getTime();
  return Array.from({ length: noteCount }, () => ({
    contactId,
    body: pick(NOTE_TEMPLATES),
    createdAt: new Date(Math.round(from + random() * (now - from))),
  }));
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  try {
    const [{ value: existingContacts }] = await db.select({ value: count() }).from(contacts);
    if (existingContacts > 0) {
      // Never mix test people into real data and never delete anything here.
      console.error(
        `Seed skipped: the database already has ${existingContacts} contact(s). Test data is added only to an empty database.`,
      );
      process.exitCode = 1;
      return;
    }

    const now = Date.now();
    const newContacts = generateContacts(now);

    const noteCount = await db.transaction(async (tx) => {
      const inserted: { id: number; createdAt: Date }[] = [];
      // Sequential chunks keep ids in the same order as creation dates.
      for (const batch of chunk(newContacts, 250)) {
        const rows = await tx
          .insert(contacts)
          .values(batch)
          .returning({ id: contacts.id, createdAt: contacts.createdAt });
        inserted.push(...rows);
      }

      const newNotes = inserted.flatMap((contact) => generateNotes(contact.id, contact.createdAt, now));
      for (const batch of chunk(newNotes, 500)) {
        await tx.insert(notes).values(batch);
      }
      return newNotes.length;
    });

    console.log(`Seeded ${newContacts.length} contacts and ${noteCount} notes.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});
