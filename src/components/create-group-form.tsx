"use client";

import { useActionState } from "react";

import { createGroupAction } from "@/app/groups/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { initialGroupFormState } from "@/lib/group-form";

export function CreateGroupForm() {
  const [state, formAction, isPending] = useActionState(createGroupAction, initialGroupFormState);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-2">
      <Field data-invalid={state.error ? true : undefined}>
        <FieldLabel htmlFor="new-group-name" className="sr-only">
          Новая группа
        </FieldLabel>
        <div className="flex items-start gap-2">
          {/* After a create the server returns an empty name, which clears the field; after an error, the typed text. */}
          <Input
            id="new-group-name"
            name="name"
            defaultValue={state.name}
            placeholder="Новая группа"
            autoComplete="off"
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? "new-group-name-error" : undefined}
            className="h-10 flex-1 text-base"
          />
          <Button type="submit" size="lg" className="h-10 px-4" disabled={isPending}>
            {isPending ? "Создаю…" : "Создать"}
          </Button>
        </div>
        {state.error && <FieldError id="new-group-name-error">{state.error}</FieldError>}
      </Field>
    </form>
  );
}
