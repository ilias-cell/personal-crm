import { LinkIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export const metadata: Metadata = {
  title: "Ссылка устарела",
};

// Where a login link leads when it was already used, is older than 15 minutes or was cancelled by a newer one.
export default function ExpiredLinkPage() {
  return (
    <main>
      <Empty className="border border-input py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LinkIcon />
          </EmptyMedia>
          <EmptyTitle>Ссылка устарела, запросите новую</EmptyTitle>
          <EmptyDescription>
            Ссылка из письма работает один раз и 15 минут. Если вы просили несколько ссылок,
            работает только последняя.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/login" className={buttonVariants({ size: "lg", className: "h-10 px-4" })}>
            Запросить новую ссылку
          </Link>
        </EmptyContent>
      </Empty>
    </main>
  );
}
