"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  EMAIL_MAX_LENGTH,
  initialContactFormState,
  NAME_MAX_LENGTH,
  PHONE_MAX_LENGTH,
  TEXT_MAX_LENGTH,
  TOUCH_FREQUENCY_LABELS,
  type ContactFormField,
  type ContactFormState,
  type ContactFormValues,
} from "@/lib/contact-form";

const EMPTY_VALUES: ContactFormValues = {
  name: "",
  about: "",
  howMet: "",
  phone: "",
  email: "",
  touchFrequency: "",
};

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
    formRef.current
      ?.querySelector<HTMLElement>('input[aria-invalid="true"], select[aria-invalid="true"]')
      ?.focus();
  }, [state]);

  return (
    // Validation runs on the server, so every message is in Russian and looks the same in any browser.
    <form
      ref={formRef}
      action={formAction}
      noValidate
      className="flex flex-col gap-6 rounded-card border bg-card p-5 sm:p-8 lg:shadow-card"
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
        <TouchFrequencyField value={values.touchFrequency} error={state.fieldErrors.touchFrequency} />
      </FieldGroup>

      {state.formError && (
        <p role="alert" className="rounded-control bg-destructive/10 px-3 py-2 text-sm text-destructive">
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

function TouchFrequencyField({ value, error }: { value: string; error: string | undefined }) {
  const selectId = "contact-touchFrequency";
  const descriptionId = `${selectId}-description`;
  const errorId = `${selectId}-error`;
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={selectId}>
        <span>Как часто общаться</span>
      </FieldLabel>
      {/* After a failed save React resets the form, and a select falls back to the option it was first
          rendered with. Keying it by the value makes it render again with the choice the user sent. */}
      <NativeSelect
        key={value}
        id={selectId}
        name="touchFrequency"
        defaultValue={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${descriptionId} ${errorId}` : descriptionId}
        className="w-full max-w-70 [&>select]:h-10 [&>select]:text-base"
      >
        <NativeSelectOption value="">Не задано</NativeSelectOption>
        {Object.entries(TOUCH_FREQUENCY_LABELS).map(([frequency, label]) => (
          <NativeSelectOption key={frequency} value={frequency}>
            {label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <FieldDescription id={descriptionId}>
        Когда срок пройдёт, человек появится на странице «Пора связаться».
      </FieldDescription>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </Field>
  );
}
