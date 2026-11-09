import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { auth } from "@/lib/auth";
import {
  loginLinkOf,
  mailsTo,
  openLink,
  postMagicLink,
  requestLoginLink,
  signIn,
  uniqueEmail,
  waitForMails,
} from "@/test/auth";

async function countRows(table: "users" | "verifications" | "login_emails"): Promise<number> {
  const { rows } = await db.execute<{ total: string }>(
    sql.raw(`select count(*) as total from ${table}`),
  );
  return Number(rows[0].total);
}

async function currentUserEmail(headers: Headers): Promise<string | null> {
  const session = await auth.api.getSession({ headers });
  return session?.user.email ?? null;
}

describe("asking for a login link", () => {
  it("sends the email from «Личная CRM» with the subject of the spec", async () => {
    const email = uniqueEmail("anna");

    await requestLoginLink(email);

    const [mail] = await mailsTo(email);
    expect(mail.fromName).toBe("Личная CRM");
    expect(mail.fromAddress).toBe("noreply@mail.therooks.ru");
    expect(mail.subject).toBe("Вход в Личную CRM");
    expect(mail.html).toContain("Войти");
    expect(mail.text).toContain("Ссылка работает 15 минут.");
    expect(mail.text).toContain("Если вы не запрашивали вход — просто проигнорируйте письмо");
  });

  it("answers the same for a known and a new address, and sends both emails", async () => {
    const known = uniqueEmail("known");
    const stranger = uniqueEmail("new");
    await signIn(known);

    const knownAnswer = await postMagicLink({ email: known });
    const strangerAnswer = await postMagicLink({ email: stranger });

    expect(knownAnswer.status).toBe(200);
    expect(strangerAnswer.status).toBe(200);
    expect(await knownAnswer.json()).toEqual(await strangerAnswer.json());
    expect(await waitForMails(known, 2)).toHaveLength(2);
    expect(await waitForMails(stranger, 1)).toHaveLength(1);
  });

  it("writes the address trimmed and in lower case, and sends the email there", async () => {
    const email = uniqueEmail("anna");

    await auth.api.signInMagicLink({
      body: { email: `  ${email.toUpperCase()}  ` },
      headers: new Headers(),
    });

    expect(await waitForMails(email, 1)).toHaveLength(1);
  });
});

describe("a wrong address", () => {
  it.each(["anna@", "anna", "", "   "])(
    "is refused when it comes straight to the server: %j",
    async (wrong) => {
      const response = await postMagicLink({ email: wrong });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: "INVALID_EMAIL",
        message: "Проверьте адрес почты",
      });
      // Nothing was written: no link, no spent attempt.
      expect(await countRows("verifications")).toBe(0);
      expect(await countRows("login_emails")).toBe(0);
    },
  );

  it("does not use up the limit of the address", async () => {
    for (let attempt = 0; attempt < 3; attempt++) await postMagicLink({ email: "anna@" });
    const email = uniqueEmail("anna");

    const response = await postMagicLink({ email });

    expect(response.status).toBe(200);
    expect(await waitForMails(email, 1)).toHaveLength(1);
  });
});

describe("logging in by the link", () => {
  it("lets the person in", async () => {
    const email = uniqueEmail("anna");

    const { headers } = await signIn(email);

    expect(await currentUserEmail(headers)).toBe(email);
  });

  it("registers a new person at the first login, without asking for a name", async () => {
    const email = uniqueEmail("anna");
    expect(await countRows("users")).toBe(0);

    await signIn(email);

    const { rows } = await db.execute<{ email: string; name: string; email_verified: boolean }>(
      sql`select email, name, email_verified from users`,
    );
    expect(rows).toEqual([{ email, name: "", email_verified: true }]);
  });

  it("is the same person when the address is written in other letters", async () => {
    const email = uniqueEmail("anna");
    const first = await signIn(email);

    const link = await (async () => {
      await auth.api.signInMagicLink({
        body: { email: `  ${email.toUpperCase()} ` },
        headers: new Headers(),
      });
      const [newest] = await waitForMails(email, 2);
      return loginLinkOf(newest);
    })();
    const second = await openLink(link);

    expect(await countRows("users")).toBe(1);
    expect(second.loggedIn).toBe(true);
    expect(await currentUserEmail(new Headers({ cookie: second.cookie }))).toBe(email);
    expect(await currentUserEmail(first.headers)).toBe(email);
  });
});

describe("the link", () => {
  it("works once: the second time leads to the «Ссылка устарела» page", async () => {
    const link = await requestLoginLink(uniqueEmail("anna"));
    expect((await openLink(link)).loggedIn).toBe(true);

    const second = await openLink(link);

    expect(second.loggedIn).toBe(false);
    expect(second.location).toContain("/login/expired");
  });

  it("does not work after 15 minutes", async () => {
    const link = await requestLoginLink(uniqueEmail("anna"));
    await db.execute(sql`update verifications set expires_at = now() - interval '1 second'`);

    const opened = await openLink(link);

    expect(opened.loggedIn).toBe(false);
    expect(opened.location).toContain("/login/expired");
  });

  it("lives 15 minutes", async () => {
    await requestLoginLink(uniqueEmail("anna"));

    const { rows } = await db.execute<{ minutes: number }>(
      sql`select extract(epoch from (expires_at - created_at)) / 60 as minutes from verifications`,
    );
    expect(Math.round(rows[0].minutes)).toBe(15);
  });

  it("is cancelled by a newer link for the same address", async () => {
    const email = uniqueEmail("anna");
    const first = await requestLoginLink(email);
    const second = await requestLoginLink(email);

    const openedFirst = await openLink(first);
    const openedSecond = await openLink(second);

    expect(openedFirst.loggedIn).toBe(false);
    expect(openedFirst.location).toContain("/login/expired");
    expect(openedSecond.loggedIn).toBe(true);
  });

  it("does not cancel the links of another address", async () => {
    const annaLink = await requestLoginLink(uniqueEmail("anna"));
    await requestLoginLink(uniqueEmail("boris"));

    expect((await openLink(annaLink)).loggedIn).toBe(true);
  });

  it("is not stored in the database itself, only its fingerprint", async () => {
    const link = await requestLoginLink(uniqueEmail("anna"));
    const token = new URL(link).searchParams.get("token")!;

    const { rows } = await db.execute<{ identifier: string }>(
      sql`select identifier from verifications`,
    );
    expect(rows[0].identifier).not.toContain(token);
  });
});

describe("limits when the request comes straight to the server", () => {
  it("refuses the fourth request for an address within 10 minutes and sends no fourth email", async () => {
    const email = uniqueEmail("anna");
    for (let attempt = 0; attempt < 3; attempt++) {
      expect((await postMagicLink({ email })).status).toBe(200);
    }

    const fourth = await postMagicLink({ email });

    expect(fourth.status).toBe(429);
    expect(await fourth.json()).toMatchObject({
      code: "TOO_MANY_LOGIN_EMAILS",
      message: "Слишком часто, попробуйте через несколько минут",
    });
    expect(await mailsTo(email)).toHaveLength(3);
  });

  it("keeps the earlier links working when the limit is reached", async () => {
    const email = uniqueEmail("anna");
    for (let attempt = 0; attempt < 3; attempt++) await postMagicLink({ email });
    await postMagicLink({ email });
    const [newest] = await waitForMails(email, 3);

    expect((await openLink(loginLinkOf(newest))).loggedIn).toBe(true);
  });

  it("refuses the eleventh email from one internet address in an hour, but not from another", async () => {
    const fromHome = { "x-forwarded-for": "203.0.113.7" };
    for (let index = 0; index < 10; index++) {
      expect((await postMagicLink({ email: uniqueEmail("person") }, fromHome)).status).toBe(200);
    }

    const eleventh = await postMagicLink({ email: uniqueEmail("person") }, fromHome);
    const fromElsewhere = await postMagicLink(
      { email: uniqueEmail("person") },
      { "x-forwarded-for": "203.0.113.8" },
    );

    expect(eleventh.status).toBe(429);
    expect(fromElsewhere.status).toBe(200);
  });
});
