"use client"; // Error boundaries must be Client Components

import { TriangleAlertIcon } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main>
      <Empty className="border border-input py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TriangleAlertIcon />
          </EmptyMedia>
          <EmptyTitle>Не удалось загрузить данные</EmptyTitle>
          <EmptyDescription>
            Скорее всего, не запущена база данных. Запустите её командой docker compose up -d и
            попробуйте снова.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="lg" className="h-10 px-4" onClick={() => retry()}>
            Попробовать снова
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
