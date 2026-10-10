import { PencilIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { addNote } from "@/app/actions";
import { BackLink } from "@/components/back-link";
import { ContactAvatar } from "@/components/contact-avatar";
import { NoteForm } from "@/components/note-form";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getContact, listNotes, parseContactId } from "@/lib/contacts";
import { formatDate, formatDateTime, formatNoteCount } from "@/lib/format";

type Params = PageProps<"/contacts/[id]">["params"];

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const contactId = parseContactId(id);
  const contact = contactId === null ? null : await getContact(contactId);
  return { title: contact?.name ?? "Контакт не найден" };
}

export default function ContactPage({ params }: { params: Params }) {
  return (
    <main className="flex flex-col gap-6">
      <BackLink href="/">Все контакты</BackLink>
      <Suspense fallback={<ContactSkeleton />}>
        <ContactCard params={params} />
      </Suspense>
    </main>
  );
}

async function ContactCard({ params }: { params: Params }) {
  const { id } = await params;
  const contactId = parseContactId(id);
  if (contactId === null) notFound();

  const [contact, notes] = await Promise.all([getContact(contactId), listNotes(contactId)]);
  if (!contact) notFound();

  return (
    <>
      <header className="flex items-start gap-4">
        <ContactAvatar name={contact.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight break-words">{contact.name}</h1>
          {contact.about && <p className="mt-0.5 break-words text-muted-foreground">{contact.about}</p>}
        </div>
        <Link
          href={`/contacts/${contact.id}/edit`}
          className={buttonVariants({ variant: "outline", size: "lg", className: "h-10 shrink-0 px-4" })}
        >
          <PencilIcon data-icon="inline-start" />
          Редактировать
        </Link>
      </header>

      <dl className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
        <DetailRow label="Откуда знакомы">{contact.howMet}</DetailRow>
        <DetailRow label="Телефон">
          {contact.phone && (
            <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="underline-offset-4 hover:underline">
              {contact.phone}
            </a>
          )}
        </DetailRow>
        <DetailRow label="Почта">
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="underline-offset-4 hover:underline">
              {contact.email}
            </a>
          )}
        </DetailRow>
        <DetailRow label="Добавлен">
          <time dateTime={contact.createdAt.toISOString()}>{formatDate(contact.createdAt)}</time>
        </DetailRow>
      </dl>

      <section className="flex flex-col gap-4" aria-labelledby="notes-heading">
        <div className="flex items-baseline gap-2">
          <h2 id="notes-heading" className="text-lg font-semibold tracking-tight">
            Заметки
          </h2>
          {notes.length > 0 && (
            <span className="text-sm text-muted-foreground">{formatNoteCount(notes.length)}</span>
          )}
        </div>

        <NoteForm action={addNote.bind(null, contact.id)} />

        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Заметок пока нет. Запишите после разговора, о чём говорили и о чём договорились.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {notes.map((note) => (
              <li key={note.id} className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
                <time dateTime={note.createdAt.toISOString()} className="text-xs text-muted-foreground">
                  {formatDateTime(note.createdAt)}
                </time>
                <p className="mt-1 break-words whitespace-pre-wrap">{note.body}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:gap-4">
      <dt className="shrink-0 text-sm text-muted-foreground sm:w-40 sm:text-base">{label}</dt>
      <dd className="min-w-0 break-words">
        {children || <span className="text-muted-foreground">не указано</span>}
      </dd>
    </div>
  );
}

function ContactSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-7 w-56 max-w-full" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-6 w-28" />
      <Skeleton className="h-36 rounded-xl" />
    </div>
  );
}
