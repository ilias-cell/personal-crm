// The content of the login email. A pure function: the link goes in, subject, HTML and plain text come out.

// Colors of the design tokens in globals.css, copied as plain values: CSS variables do not work in emails.
const COLORS = {
  paper: "#f3eee5",
  surface: "#fbf8f2",
  ink: "#231e18",
  mutedInk: "#5e554a",
  line: "#ddd4c5",
};

const LINK_LIFETIME_TEXT = "Ссылка работает 15 минут.";
const IGNORE_TEXT = "Если вы не запрашивали вход — просто проигнорируйте письмо";

export type LoginEmail = { subject: string; html: string; text: string };

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildLoginEmail(url: string): LoginEmail {
  const safeUrl = escapeHtml(url);
  const font = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

  // Mail programs ignore CSS files, so the page is a plain table with inline styles.
  const html = `<!doctype html>
<html lang="ru">
  <body style="margin:0;padding:0;background:${COLORS.paper};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.paper};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:${COLORS.surface};border:1px solid ${COLORS.line};border-radius:6px;">
            <tr>
              <td style="padding:32px;font-family:${font};color:${COLORS.ink};font-size:16px;line-height:1.5;">
                <p style="margin:0 0 8px;font-size:20px;font-weight:600;">Вход в Личную CRM</p>
                <p style="margin:0 0 24px;color:${COLORS.mutedInk};">Нажмите кнопку, чтобы войти.</p>
                <p style="margin:0 0 24px;">
                  <a href="${safeUrl}" style="display:inline-block;padding:12px 24px;background:${COLORS.ink};color:${COLORS.paper};text-decoration:none;border-radius:4px;font-weight:600;">Войти</a>
                </p>
                <p style="margin:0 0 8px;color:${COLORS.mutedInk};font-size:14px;">${LINK_LIFETIME_TEXT}</p>
                <p style="margin:0;color:${COLORS.mutedInk};font-size:14px;">${IGNORE_TEXT}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "Вход в Личную CRM",
    "",
    "Чтобы войти, откройте ссылку:",
    url,
    "",
    LINK_LIFETIME_TEXT,
    IGNORE_TEXT,
  ].join("\n");

  return { subject: "Вход в Личную CRM", html, text };
}
