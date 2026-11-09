import type { Metadata } from "next";
import { Commissioner, Literata } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";

import { UserMenu } from "@/components/user-menu";
import "./globals.css";

const commissioner = Commissioner({
  variable: "--font-commissioner",
  subsets: ["latin", "cyrillic"],
});

// The optical size axis makes big headings finer than body-size text, as on the landing.
const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin", "cyrillic"],
  style: ["normal", "italic"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: {
    default: "Личная CRM",
    template: "%s · Личная CRM",
  },
  description: "Контакты людей, которых я знаю лично",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-scroll-behavior: smooth scrolling from globals.css stays within a page, but going to another page
    // (for example the next page of the contact list from under it) jumps to its start at once.
    <html
      lang="ru"
      data-scroll-behavior="smooth"
      className={`${commissioner.variable} ${literata.variable} h-full`}
    >
      <body className="min-h-full">
        <header className="border-b border-line-soft">
          <div className="mx-auto flex h-15 w-full max-w-3xl items-center justify-between gap-3 px-6 lg:h-18">
            <Link href="/" className="shrink-0 font-serif text-lg font-medium lg:text-xl">
              Личная CRM
            </Link>
            {/* Reads the login, so it waits for the request; until then, and for someone not logged in, it is empty. */}
            <Suspense fallback={null}>
              <UserMenu />
            </Suspense>
          </div>
        </header>
        <div className="mx-auto w-full max-w-3xl px-6 py-8 sm:py-12">{children}</div>
      </body>
    </html>
  );
}
