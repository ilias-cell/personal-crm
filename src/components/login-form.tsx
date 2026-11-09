"use client";

import { useActionState } from "react";

import { requestLoginLink } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  INVALID_EMAIL_MESSAGE,
  initialLoginFormState,
  type LoginFormState,
} from "@/lib/login-form";

// The email field and «Получить ссылку». The field and the button stay after the link is sent,
// so a link can be asked for again.
export function LoginForm() {
  const [state, formAction, isPending] = useActionState<LoginFormState, FormData>(
    requestLoginLink,
    initialLoginFormState,
  );
  // A wrong address is shown under the field; a limit or a failed send is about the whole form, so it is below it.
  const fieldError = state.error === INVALID_EMAIL_MESSAGE ? state.error : null;
  const formError = fieldError ? null : state.error;

  return (
    // noValidate: the server checks the address and answers with the same words as everywhere else,
    // instead of the browser's own bubble.
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <Field data-invalid={fieldError ? true : undefined}>
        <FieldLabel htmlFor="login-email">Почта</FieldLabel>
        {/* The server returns what was typed after an error and the cleaned-up address after a success. */}
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          defaultValue={state.email}
          key={state.sentTo ?? state.email}
          placeholder="name@example.com"
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? "login-email-error" : undefined}
          className="h-10 text-base"
        />
        {fieldError && <FieldError id="login-email-error">{fieldError}</FieldError>}
      </Field>
      <Button type="submit" size="lg" className="h-10 px-4" disabled={isPending}>
        {isPending ? "Отправляю…" : "Получить ссылку"}
      </Button>
      <div aria-live="polite">
        {state.sentTo && (
          <p className="text-15 text-muted-foreground">
            Ссылка для входа отправлена на {state.sentTo}
          </p>
        )}
        {formError && (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        )}
      </div>
    </form>
  );
}
