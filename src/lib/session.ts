import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth";

export type CurrentUser = { id: string; email: string };

// Who is logged in on this request, or null. Reads the request, so it works only inside <Suspense> on pages.
// Wrapped in React.cache: the header, the page and the page title share one lookup per request.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  return session ? { id: session.user.id, email: session.user.email } : null;
});

// For pages and server actions: no login (or a closed or expired one) leads to the login page.
// Every server action calls it first, because an action is reachable by a direct request, not only through the page.
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
