import type { Metadata } from "next";

import { createContact } from "@/app/actions";
import { BackLink } from "@/components/back-link";
import { ContactForm } from "@/components/contact-form";

export const metadata: Metadata = {
  title: "Новый контакт",
};

export default function NewContactPage() {
  return (
    <main className="flex flex-col gap-6">
      <BackLink href="/">Все контакты</BackLink>
      <h1 className="font-serif text-32 font-normal tracking-[-0.015em] lg:text-4xl lg:leading-[1.12]">Новый контакт</h1>
      <ContactForm
        action={createContact}
        submitLabel="Добавить контакт"
        pendingLabel="Добавляю…"
        cancelHref="/"
      />
    </main>
  );
}
