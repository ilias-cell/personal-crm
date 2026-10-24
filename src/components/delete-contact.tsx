"use client";

import { Trash2Icon } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { initialDeleteContactState, type DeleteContactState } from "@/lib/contact-form";
import { formatNumber } from "@/lib/format";

// Two steps in place, no modal: the button turns into a question with "Delete" and "Cancel".
export function DeleteContact({
  action,
  contactName,
  noteCount,
}: {
  action: (state: DeleteContactState) => Promise<DeleteContactState>;
  contactName: string;
  noteCount: number;
}) {
  const [state, formAction, isPending] = useActionState(action, initialDeleteContactState);
  const [isConfirming, setIsConfirming] = useState(false);

  const openButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  // Keyboard users keep their place: focus goes to the safe choice ("Cancel") and comes back to the opening button.
  useEffect(() => {
    if (isConfirming) {
      cancelButtonRef.current?.focus();
    } else if (wasConfirming.current) {
      openButtonRef.current?.focus();
    }
    wasConfirming.current = isConfirming;
  }, [isConfirming]);

  if (!isConfirming) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">Контакт и все его заметки исчезнут навсегда.</p>
        <Button
          ref={openButtonRef}
          type="button"
          variant="destructive"
          size="lg"
          className="h-10 px-4"
          onClick={() => setIsConfirming(true)}
        >
          <Trash2Icon data-icon="inline-start" />
          Удалить контакт
        </Button>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !isPending) setIsConfirming(false);
      }}
    >
      <p role="alert" className="break-words">
        Удалить контакт «{contactName}»?
        {noteCount > 0 && ` Вместе с ним удалятся заметки: ${formatNumber(noteCount)}.`} Отменить это нельзя.
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
          onClick={() => setIsConfirming(false)}
        >
          Отмена
        </Button>
      </div>
    </form>
  );
}
