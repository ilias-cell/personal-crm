// The state of the login form. It lives apart from the action: a file with "use server" may export only functions.

export type LoginFormState = {
  // What the field shows: the text the person typed after an error, the cleaned-up address after a success.
  email: string;
  // Under the field. Null when there is nothing to complain about.
  error: string | null;
  // The address the link was sent to, written the way it is stored. Null until a link is sent.
  sentTo: string | null;
};

export const initialLoginFormState: LoginFormState = { email: "", error: null, sentTo: null };

// The texts of the form. Shared: the server writes them, and the form decides by them where to show an error.
export const INVALID_EMAIL_MESSAGE = "Проверьте адрес почты";
export const TOO_MANY_LOGIN_EMAILS_MESSAGE = "Слишком часто, попробуйте через несколько минут";
export const EMAIL_SEND_FAILED_MESSAGE = "Не удалось отправить письмо. Попробуйте ещё раз.";
