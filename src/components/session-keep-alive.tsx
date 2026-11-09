"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Moves the end of the login forward, so it lasts 30 days from the last visit.
// Better Auth moves it only when asked through its own route, not while a page is being built,
// so the browser asks when the app is opened and on every change of page.
export function SessionKeepAlive() {
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/auth/get-session", { credentials: "same-origin", cache: "no-store" }).catch(() => {
      // Offline or the server is restarting: the next visit asks again.
    });
  }, [pathname]);

  return null;
}
