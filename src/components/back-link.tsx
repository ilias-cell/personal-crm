import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

import { ContactListLink } from "@/components/contact-list-link";

const backLinkClassName =
  "inline-flex w-fit items-center gap-1.5 rounded-md text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50";

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={backLinkClassName}>
      <ArrowLeftIcon className="size-4" aria-hidden="true" />
      {children}
    </Link>
  );
}

// "Все контакты": back to the page and search of the list last opened in this tab.
export function BackToContactList() {
  return (
    <ContactListLink className={backLinkClassName}>
      <ArrowLeftIcon className="size-4" aria-hidden="true" />
      Все контакты
    </ContactListLink>
  );
}
