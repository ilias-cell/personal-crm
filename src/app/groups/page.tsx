import { TagsIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { BackToContactList } from "@/components/back-link";
import { CreateGroupForm } from "@/components/create-group-form";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { GroupRow } from "@/components/group-row";
import { Skeleton } from "@/components/ui/skeleton";
import { listGroupsWithCounts } from "@/lib/groups";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Группы",
};

export default function GroupsPage() {
  return (
    <main className="flex flex-col gap-4">
      <BackToContactList />
      <header className="border-b-2 border-ink pb-3">
        <h1 className="font-serif text-32 font-normal tracking-[-0.015em] lg:text-4xl lg:leading-[1.12]">
          Группы
        </h1>
      </header>
      <CreateGroupForm />
      <Suspense fallback={<GroupListSkeleton />}>
        <GroupList />
      </Suspense>
    </main>
  );
}

async function GroupList() {
  // Groups change on every visit's request, so they are read then, never at build time.
  await connection();
  const user = await requireUser();
  const groups = await listGroupsWithCounts(user.id);

  if (groups.length === 0) {
    return (
      <Empty className="border border-input py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TagsIcon />
          </EmptyMedia>
          <EmptyTitle>Пока нет ни одной группы</EmptyTitle>
          <EmptyDescription>
            Группы помогают раскладывать людей: семья, друзья, теннис. Создайте первую здесь или в
            карточке контакта кнопкой «+ группа».
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <section aria-label="Список групп">
      <ul className="divide-y divide-line-soft overflow-hidden rounded-card border bg-card lg:shadow-card">
        {groups.map((group) => (
          <li key={group.id}>
            <GroupRow group={group} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function GroupListSkeleton() {
  return (
    <div
      className="divide-y divide-line-soft overflow-hidden rounded-card border bg-card"
      aria-hidden="true"
    >
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex h-14 items-center px-4">
          <Skeleton className="h-4 w-52" />
        </div>
      ))}
    </div>
  );
}
