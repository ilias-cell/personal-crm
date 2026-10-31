"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

// The place in the contact list (page and search) last opened in this browser tab.
// sessionStorage lives exactly as long as the tab and survives a reload.
const STORAGE_KEY = "contact-list-href";

// Put on the contact list: remembers its address every time it changes.
export function RememberContactListHref() {
  const query = useSearchParams().toString();
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, query ? `/?${query}` : "/");
    } catch {
      // Storage can be blocked, for example in some private modes: "Все контакты" then opens the first page.
    }
  }, [query]);
  return null;
}

function readStoredHref(): string {
  try {
    const href = sessionStorage.getItem(STORAGE_KEY);
    // Only addresses of the list itself; anything else is a stale or foreign value.
    if (href && (href === "/" || href.startsWith("/?"))) return href;
  } catch {
    // Same as above: blocked storage means the first page.
  }
  return "/";
}

// The value never changes while a page is open, so there is nothing to subscribe to.
const subscribe = () => () => {};

// A link to the contact list that leads back to the page and search last opened in this tab.
// The server and the first render use "/", so their markup matches; the stored address replaces it right after.
export function ContactListLink(props: Omit<React.ComponentProps<typeof Link>, "href">) {
  const href = useSyncExternalStore(subscribe, readStoredHref, () => "/");
  return <Link href={href} {...props} />;
}
