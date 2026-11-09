import { describe, expect, it } from "vitest";

import { buildLoginEmail } from "@/lib/login-email";

const URL_IN_EMAIL = "http://127.0.0.1:3001/api/auth/magic-link/verify?token=abc&callbackURL=%2F";

describe("login email", () => {
  it("has the subject of the spec", () => {
    expect(buildLoginEmail(URL_IN_EMAIL).subject).toBe("Вход в Личную CRM");
  });

  it("has a «Войти» button that leads to the login link", () => {
    const { html } = buildLoginEmail(URL_IN_EMAIL);

    // The "&" inside an attribute is written as "&amp;" in HTML.
    expect(html).toMatch(
      /<a [^>]*href="http:\/\/127\.0\.0\.1:3001\/api\/auth\/magic-link\/verify\?token=abc&amp;callbackURL=%2F"[^>]*>\s*Войти\s*<\/a>/,
    );
  });

  it("says that the link works for 15 minutes and what to do when it was not requested", () => {
    const { html, text } = buildLoginEmail(URL_IN_EMAIL);

    for (const body of [html, text]) {
      expect(body).toContain("Ссылка работает 15 минут.");
      expect(body).toContain("Если вы не запрашивали вход — просто проигнорируйте письмо");
    }
  });

  it("has the same link in the text version", () => {
    expect(buildLoginEmail(URL_IN_EMAIL).text).toContain(URL_IN_EMAIL);
  });

  it("does not let the link break out of the HTML", () => {
    const { html } = buildLoginEmail('http://example.com/?a="><script>alert(1)</script>');

    expect(html).not.toContain("<script>");
  });
});
