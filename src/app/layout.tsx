import type { Metadata } from "next";
import { Commissioner, Literata } from "next/font/google";
import Link from "next/link";
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
    <html lang="ru" className={`${commissioner.variable} ${literata.variable} h-full`}>
      <body className="min-h-full">
        <header className="border-b border-line-soft">
          <div className="mx-auto flex h-15 w-full max-w-3xl items-center px-6 lg:h-18">
            <Link href="/" className="font-serif text-lg font-medium lg:text-xl">
              Личная CRM
            </Link>
          </div>
        </header>
        <div className="mx-auto w-full max-w-3xl px-6 py-8 sm:py-12">{children}</div>
      </body>
    </html>
  );
}
