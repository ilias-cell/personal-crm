import { afterEach, describe, expect, it, vi } from "vitest";

import { requestLoginLink, signOut } from "@/app/login/actions";
import { auth } from "@/lib/auth";
import { initialLoginFormState } from "@/lib/login-form";
import { mailsTo, signIn, uniqueEmail, waitForMails } from "@/test/auth";

// The only thing replaced: the request headers, which exist only inside a running Next.js.
// A request from the form has no X-Forwarded-For here, as on the owner's computer.
const { requestHeaders } = vi.hoisted(() => ({ requestHeaders: vi.fn() }));
vi.mock("next/headers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/headers")>()),
  headers: requestHeaders,
}));

// Redirecting needs a running Next.js too. The real one stops the code by throwing, and so does this.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect to ${url}`);
  },
}));

function form(email: string): FormData {
  const formData = new FormData();
  formData.set("email", email);
  return formData;
}

async function ask(email: string) {
  requestHeaders.mockResolvedValue(new Headers());
  return requestLoginLink(initialLoginFormState, form(email));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("asking for a login link in the form", () => {
  it("says the link is sent to the address in its clean form, and the email arrives", async () => {
    const email = uniqueEmail("anna");

    const state = await ask(`  ${email.toUpperCase()}  `);

    expect(state).toEqual({ email, error: null, sentTo: email });
    expect(await waitForMails(email, 1)).toHaveLength(1);
  });

  it("shows the error under the field, keeps the typed text and sends nothing for a wrong address", async () => {
    for (const wrong of ["anna@", "anna", "", "   "]) {
      const state = await ask(wrong);

      expect(state).toEqual({ email: wrong, error: "Проверьте адрес почты", sentTo: null });
    }
  });

  it("says it is too often after the third email in 10 minutes, and keeps the typed text", async () => {
    const email = uniqueEmail("anna");
    for (let attempt = 1; attempt <= 3; attempt++) {
      expect((await ask(email)).sentTo).toBe(email);
    }

    const state = await ask(email);

    expect(state).toEqual({
      email,
      error: "Слишком часто, попробуйте через несколько минут",
      sentTo: null,
    });
    expect(await mailsTo(email)).toHaveLength(3);
  });

  it("says the email was not sent when the mail server is not reachable, without putting the address in the log", async () => {
    const email = uniqueEmail("anna");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const smtpUrl = process.env.SMTP_URL;
    // Nobody listens on this port.
    process.env.SMTP_URL = "smtp://127.0.0.1:1";
    try {
      const state = await ask(email);

      expect(state).toEqual({
        email,
        error: "Не удалось отправить письмо. Попробуйте ещё раз.",
        sentTo: null,
      });
    } finally {
      process.env.SMTP_URL = smtpUrl;
    }
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain(email);
  });
});

describe("logging out", () => {
  it("ends the login of this device only and goes to the login page", async () => {
    const email = uniqueEmail("anna");
    const laptop = await signIn(email);
    const phone = await signIn(email);
    requestHeaders.mockResolvedValue(laptop.headers);

    await expect(signOut()).rejects.toThrow("redirect to /login");

    expect(await auth.api.getSession({ headers: laptop.headers })).toBeNull();
    expect((await auth.api.getSession({ headers: phone.headers }))?.user.email).toBe(email);
  });
});
