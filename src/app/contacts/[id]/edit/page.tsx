import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { updateContact } from "@/app/actions";
import { BackLink } from "@/components/back-link";
import { ContactForm } from "@/components/contact-form";
import { Skeleton } from "@/components/ui/skeleton";
import { getContact, parseContactId } from "@/lib/contacts";

type Params = PageProps<"/contacts/[id]/edit">["params"];

export const metadata: Metadata = {
  title: "Редактирование контакта",
};

export default function EditContactPage({ params }: { params: Params }) {
  return (
    <main className="flex flex-col gap-6">
      <Suspense fallback={<EditContactSkeleton />}>
        <EditContact params={params} />
      </Suspense>
    </main>
  );
}

async function EditContact({ params }: { params: Params }) {
  const { id } = await params;
  const contactId = parseContactId(id);
  if (contactId === null) notFound();

  const contact = await getContact(contactId);
  if (!contact) notFound();

  const cardHref = `/contacts/${contact.id}`;

  return (
    <>
      <BackLink href={cardHref}>{contact.name}</BackLink>
      <h1 className="text-2xl font-semibold tracking-tight">Редактирование контакта</h1>
      <ContactForm
        // A saved change gives the form a new key, so it never shows values from before the save.
        key={contact.updatedAt.toISOString()}
        action={updateContact.bind(null, contact.id)}
        initialValues={{
          name: contact.name,
          about: contact.about ?? "",
          howMet: contact.howMet ?? "",
          phone: contact.phone ?? "",
          email: contact.email ?? "",
        }}
        submitLabel="Сохранить"
        pendingLabel="Сохраняю…"
        cancelHref={cardHref}
      />
    </>
  );
}

function EditContactSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-8 w-72 max-w-full" />
      <div className="flex flex-col gap-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
