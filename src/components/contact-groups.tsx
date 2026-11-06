"use client";

import { PlusIcon, XIcon } from "lucide-react";
import { useActionState, useState, useTransition } from "react";

import {
  addContactToGroupAction,
  addContactToGroupByNameAction,
  removeContactFromGroupAction,
} from "@/app/groups/actions";
import { GroupBadge } from "@/components/group-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { initialGroupFormState } from "@/lib/group-form";
import type { GroupSummary } from "@/lib/groups";

// The "Группы" row of the card: the person's groups as labels with a cross, and the "+ группа" button.
export function ContactGroups({
  contactId,
  memberGroups,
  otherGroups,
}: {
  contactId: number;
  // The groups the person is in, and the ones they are not in yet (offered in the popup), both alphabetical.
  memberGroups: GroupSummary[];
  otherGroups: GroupSummary[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [isRemoving, startRemoving] = useTransition();

  function remove(groupId: number) {
    setError(null);
    startRemoving(async () => {
      const result = await removeContactFromGroupAction(contactId, groupId);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap items-center gap-2" aria-label="Группы контакта">
        {memberGroups.map((group) => (
          <li key={group.id}>
            <GroupBadge className="h-auto min-h-6 gap-0.5 pr-1 break-words whitespace-normal">
              {group.name}
              <button
                type="button"
                aria-label={`Убрать из группы «${group.name}»`}
                disabled={isRemoving}
                onClick={() => remove(group.id)}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-full outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
              >
                <XIcon className="size-3" aria-hidden="true" />
              </button>
            </GroupBadge>
          </li>
        ))}
        <li>
          <AddToGroup contactId={contactId} otherGroups={otherGroups} />
        </li>
      </ul>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function AddToGroup({
  contactId,
  otherGroups,
}: {
  contactId: number;
  otherGroups: GroupSummary[];
}) {
  const [open, setOpen] = useState(false);

  // Escape, a click outside and the trigger are handled by the popover; the popup closes itself after a success.
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <PlusIcon className="size-3.5" aria-hidden="true" />
        группа
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="Добавить в группу"
        className="w-72 max-w-[calc(100vw-3rem)]"
      >
        <AddToGroupContent
          contactId={contactId}
          otherGroups={otherGroups}
          onDone={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

function AddToGroupContent({
  contactId,
  otherGroups,
  onDone,
}: {
  contactId: number;
  otherGroups: GroupSummary[];
  onDone: () => void;
}) {
  const [pickError, setPickError] = useState<string | null>(null);
  const [isPicking, startPicking] = useTransition();
  const [state, formAction, isCreating] = useActionState(
    async (previous: typeof initialGroupFormState, formData: FormData) => {
      const next = await addContactToGroupByNameAction(contactId, previous, formData);
      if (next.saved) onDone();
      return next;
    },
    initialGroupFormState,
  );
  const isBusy = isPicking || isCreating;

  function pick(groupId: number) {
    setPickError(null);
    startPicking(async () => {
      const result = await addContactToGroupAction(contactId, groupId);
      if (result.error) setPickError(result.error);
      else onDone();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {otherGroups.length > 0 && (
        <ul className="flex max-h-48 flex-col overflow-y-auto" aria-label="Готовые группы">
          {otherGroups.map((group) => (
            <li key={group.id}>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => pick(group.id)}
                className="w-full rounded-control px-2 py-1.5 text-left text-sm break-words outline-none hover:bg-muted focus-visible:bg-muted disabled:opacity-50"
              >
                {group.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {pickError && (
        <p role="alert" className="text-sm text-destructive">
          {pickError}
        </p>
      )}

      <form action={formAction} noValidate className="flex flex-col gap-2">
        <Field data-invalid={state.error ? true : undefined}>
          <FieldLabel htmlFor={`card-new-group-${contactId}`} className="sr-only">
            Новая группа
          </FieldLabel>
          <div className="flex items-start gap-2">
            <Input
              id={`card-new-group-${contactId}`}
              name="name"
              defaultValue={state.name}
              placeholder="Новая группа"
              autoComplete="off"
              aria-invalid={state.error ? true : undefined}
              aria-describedby={state.error ? `card-new-group-${contactId}-error` : undefined}
              className="h-9 flex-1 text-base"
            />
            <Button type="submit" size="lg" disabled={isBusy}>
              {isCreating ? "Создаю…" : "Создать"}
            </Button>
          </div>
          {state.error && (
            <FieldError id={`card-new-group-${contactId}-error`}>{state.error}</FieldError>
          )}
        </Field>
      </form>
    </div>
  );
}
