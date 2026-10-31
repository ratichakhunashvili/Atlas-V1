"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { screenHref, type ScreenKey } from "./screen-hrefs";

/** Moves to another screen after a delay — stands in for work that will really take time (planning, checking in). */
export function AdvanceAfter({ to, ms }: { to: ScreenKey; ms: number }) {
  const router = useRouter();
  useEffect(() => {
    const href = screenHref(to);
    if (!href) return;
    const timer = setTimeout(() => router.push(href), ms);
    return () => clearTimeout(timer);
  }, [router, to, ms]);
  return null;
}
