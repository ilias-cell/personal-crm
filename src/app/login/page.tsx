import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Вход",
};

export default function LoginPage() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6">
      <h1 className="font-serif text-32 font-normal tracking-[-0.015em] lg:text-4xl lg:leading-[1.12]">
        Вход
      </h1>
      {/* Someone who is already logged in is sent to the contacts. Reading the login waits for the request,
          so it sits behind <Suspense>, and the form is on screen at once. */}
      <Suspense fallback={null}>
        <LeaveWhenLoggedIn />
      </Suspense>
      <p className="text-15 text-muted-foreground">
        Введите почту, и мы пришлём ссылку для входа. Пароль не нужен.
      </p>
      <LoginForm />
    </main>
  );
}

async function LeaveWhenLoggedIn() {
  if (await getCurrentUser()) redirect("/");
  return null;
}
