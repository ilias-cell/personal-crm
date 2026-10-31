"use client";

import { useLinkStatus } from "next/link";

// Put inside a <Link>: while its page is loading, it sets data-pending, the same signal the search input gives,
// so whatever listens for it (the contact list dims) reacts to the click at once.
export function LinkPending() {
  const { pending } = useLinkStatus();
  return pending ? <span data-pending="" hidden /> : null;
}
