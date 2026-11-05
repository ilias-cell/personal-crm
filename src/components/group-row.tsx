"use client";

import { PencilIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { deleteGroupAction, renameGroupAction } from "@/app/groups/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatGroupSize } from "@/lib/format";
import { initialDeleteGroupState, initialGroupFormState } from "@/lib/group-form";
import type { GroupWithCount } from "@/lib/groups";

type Mode = "view" | "renaming" | "deleting";

// One group on the "Группы" page. Renaming and deleting happen in place of the row, no modal.
export function GroupRow({ group }: { group: GroupWithCount }) {
  const [mode, setMode] = useState<Mode>("view");
  const renameButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const previousMode = useRef<Mode>("view");

  // Keyboard users keep their place: after closing a form, focus returns to the button that opened it.
  useEffect(() => {
    if (mode === "view") {
      if (previousMode.current === "renaming") renameButtonRef.current?.focus();
      if (previousMode.current === "deleting") deleteButtonRef.current?.focus();
    }
    previousMode.current = mode;
  }, [mode]);

  if (mode === "renaming") {
    return <RenameGroup group={group} onClose={() => setMode("view")} />;
  }
  if (mode === "deleting") {
    return <DeleteGroup group={group} onClose={() => setMode("view")} />;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
      <div className="min-w-0 flex-1 basis-48">
        <Link
          href={`/?group=${group.id}`}
          className="rounded-sm font-serif text-17 break-words outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {group.name}
        </Link>
        <span className="text-13 whitespace-nowrap text-subtle"> — {formatGroupSize(group.contactCount)}</span>
      </div>
      <div className="flex items-center gap-1">
        <Button ref={renameButtonRef} type="button" variant="ghost" size="lg" onClick={() => setMode("renaming")}>
          <PencilIcon data-icon="inline-start" />
          Переименовать
        </Button>
        <Button ref={deleteButtonRef} type="button" variant="ghost" size="lg" onClick={() => setMode("deleting")}>
          <Trash2Icon data-icon="inline-start" />
          Удалить
        </Button>
      </div>
    </div>
  );
}

function RenameGroup({ group, onClose }: { group: GroupWithCount; onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(
    async (previous: typeof initialGroupFormState, formData: FormData) => {
      const next = await renameGroupAction(group.id, previous, formData);
      if (next.saved) onClose();
      return next;
    },
    initialGroupFormState,
  );

  return (
    <form
      action={formAction}
      noValidate
      className="flex flex-col gap-2 px-4 py-3"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !isPending) onClose();
      }}
    >
      <Field data-invalid={state.error ? true : undefined}>
        <FieldLabel htmlFor={`rename-group-${group.id}`} className="sr-only">
          Новое название группы «{group.name}»
        </FieldLabel>
        {/* Starts with the current name; after an error the server returns the typed text. */}
        <Input
          id={`rename-group-${group.id}`}
          name="name"
          defaultValue={state.error ? state.name : group.name}
          autoFocus
          autoComplete="off"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? `rename-group-${group.id}-error` : undefined}
          className="h-10 text-base"
        />
        {state.error && <FieldError id={`rename-group-${group.id}-error`}>{state.error}</FieldError>}
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="lg" className="h-10 px-4" disabled={isPending}>
          {isPending ? "Сохраняю…" : "Сохранить"}
        </Button>
        <Button type="button" variant="ghost" size="lg" className="h-10 px-4" disabled={isPending} onClick={onClose}>
          Отмена
        </Button>
      </div>
    </form>
  );
}

function DeleteGroup({ group, onClose }: { group: GroupWithCount; onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(
    deleteGroupAction.bind(null, group.id),
    initialDeleteGroupState,
  );
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Focus goes to the safe choice ("Отмена").
  useEffect(() => {
    cancelButtonRef.current?.focus();
  }, []);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 px-4 py-3"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !isPending) onClose();
      }}
    >
      <p role="alert" className="break-words">
        Удалить группу «{group.name}»? Люди из неё останутся в контактах, только без этой группы.
      </p>

      {state.error && (
        <p role="alert" className="rounded-control bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="destructive" size="lg" className="h-10 px-4" disabled={isPending}>
          {isPending ? "Удаляю…" : "Да, удалить"}
        </Button>
        <Button
          ref={cancelButtonRef}
          type="button"
          variant="ghost"
          size="lg"
          className="h-10 px-4"
          disabled={isPending}
          onClick={onClose}
        >
          Отмена
        </Button>
      </div>
    </form>
  );
}
