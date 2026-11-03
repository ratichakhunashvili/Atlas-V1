"use client";

import { useLinkStatus } from "next/link";

/*
 * Instant feedback for a tab or segment link: rendered inside the <Link>, it shows a small pulsing
 * bar the moment the link is tapped, while the current screen stays in place until the next one
 * is ready. (Full-screen loading placeholders made every tap look like the page vanished and
 * reappeared; this keeps the screen steady and still answers the tap at once.)
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute bottom-[3px] left-1/2 h-[3px] w-[22px] -translate-x-1/2 rounded-full bg-current transition-opacity duration-150 motion-safe:animate-pulse ${
        pending ? "opacity-80" : "opacity-0"
      }`}
    />
  );
}
