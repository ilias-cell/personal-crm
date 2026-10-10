"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  EMAIL_MAX_LENGTH,
  initialContactFormState,
  NAME_MAX_LENGTH,
  PHONE_MAX_LENGTH,
  TEXT_MAX_LENGTH,
  type ContactFormField,
  type ContactFormState,
  type ContactFormValues,
} from "@/lib/contact-form";

const EMPTY_VALUES: ContactFormValues = { name: "", about: "", howMet: "", phone: "", email: "" };

type FieldConfig = {
  name: ContactFormField;
  label: string;
  placeholder: string;
  maxLength: number;
  type?: "text" | "tel" | "email";
  required?: boolean;
};

const FIELDS: FieldConfig[] = [
  {
    name: "name",
    label: "Имя",
    placeholder: "Анна Смирнова",
    maxLength: NAME_MAX_LENGTH,
    required: true,
  },
  {
    name: "about",
    label: "Кто это",
    placeholder: "Стоматолог, сосед по даче, коллега из отдела продаж",
    maxLength: TEXT_MAX_LENGTH,
  },
  {
    name: "howMet",
    label: "Откуда знакомы",
    placeholder: "Учились вместе, познакомились на конференции",
    maxLength: TEXT_MAX_LENGTH,
  },
  {
    name: "phone",
    label: "Телефон",
    placeholder: "+7 900 000-00-00",
    maxLength: PHONE_MAX_LENGTH,
    type: "tel",
  },
  {
    name: "email",
    label: "Почта",
    placeholder: "name@example.com",
    maxLength: EMAIL_MAX_LENGTH,
    type: "email",
  },
];

type ContactFormProps = {
  action: (state: ContactFormState, formData: FormData) => Promise<ContactFormState>;
  initialValues?: ContactFormValues;
  submitLabel: string;
  pendingLabel: string;
  cancelHref: string;
};

export function ContactForm(props: ContactFormProps) {
  // Next.js keeps a page alive in the background after you leave it, together with everything typed into it.
  // Opening the form again through a link must start clean, not show a draft abandoned with "Отмена".
  // The key changes on such a visit and stays the same for the browser Back button, which still restores the draft.
  const { bfcacheId } = useRouter();
  return <ContactFormFields key={bfcacheId} {...props} />;
}

function ContactFormFields({
  action,
  initialValues = EMPTY_VALUES,
  submitLabel,
  pendingLabel,
  cancelHref,
}: ContactFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialContactFormState);
  const formRef = useRef<HTMLFormElement>(null);
  const values = state.values ?? initialValues;

  // After a failed save, put the cursor into the first field that needs fixing.
  useEffect(() => {
    formRef.current?.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus();
  }, [state]);

  return (
    // Validation runs on the server, so every message is in Russian and looks the same in any browser.
    <form
      ref={formRef}
      action={formAction}
      noValidate
      className="flex flex-col gap-6 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:p-6"
    >
      <FieldGroup>
        {FIELDS.map((field) => {
          const error = state.fieldErrors[field.name];
          const inputId = `contact-${field.name}`;
          const errorId = `${inputId}-error`;
          return (
            <Field key={field.name} data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor={inputId}>
                <span>
                  {field.label}
                  {field.required && (
                    <span className="text-destructive" aria-hidden="true">
                      {" *"}
                    </span>
                  )}
                </span>
              </FieldLabel>
              <Input
                id={inputId}
                name={field.name}
                type={field.type ?? "text"}
                defaultValue={values[field.name]}
                placeholder={field.placeholder}
                maxLength={field.maxLength}
                required={field.required}
                autoComplete="off"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                className="h-10 text-base"
              />
              {error && <FieldError id={errorId}>{error}</FieldError>}
            </Field>
          );
        })}
      </FieldGroup>

      {state.formError && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.formError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="lg" className="h-10 px-4" disabled={isPending}>
          {isPending ? pendingLabel : submitLabel}
        </Button>
        <Link href={cancelHref} className={buttonVariants({ variant: "ghost", size: "lg", className: "h-10 px-4" })}>
          Отмена
        </Link>
      </div>
    </form>
  );
}
