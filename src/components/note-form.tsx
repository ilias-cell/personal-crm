"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { initialNoteFormState, NOTE_MAX_LENGTH, type NoteFormState } from "@/lib/contact-form";

export function NoteForm({
  action,
}: {
  action: (state: NoteFormState, formData: FormData) => Promise<NoteFormState>;
}) {
  const [state, formAction, isPending] = useActionState(action, initialNoteFormState);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-3">
      <Field data-invalid={state.error ? true : undefined}>
        <FieldLabel htmlFor="note-body" className="sr-only">
          Новая заметка
        </FieldLabel>
        {/* After a save the server returns an empty body, which clears the field; after an error it returns the typed text. */}
        <Textarea
          id="note-body"
          name="body"
          defaultValue={state.body}
          placeholder="Что обсудили, о чём договорились"
          rows={3}
          maxLength={NOTE_MAX_LENGTH}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "note-body-error" : undefined}
          className="min-h-24 bg-card text-base"
        />
        {state.error && <FieldError id="note-body-error">{state.error}</FieldError>}
      </Field>
      <div>
        <Button type="submit" size="lg" className="h-10 px-4" disabled={isPending}>
          {isPending ? "Сохраняю…" : "Сохранить заметку"}
        </Button>
      </div>
    </form>
  );
}
