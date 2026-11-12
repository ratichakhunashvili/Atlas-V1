"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AtlasButton, type } from "@/components/atlas-ui/ui";

/*
 * When a guest screen's request fails (a dropped connection while planning, say), this replaces only that screen,
 * inside the map layout, instead of the framework's bare "This page couldn't load" page. "Try again" re-renders the
 * screen without a full reload. Found by the 2026-11 replay (U093). The error itself is logged, not shown.
 */
export default function GuestScreenError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="absolute inset-0 z-10 flex items-center justify-center bg-atlas-paper px-[20px]">
      <div role="alert" className="flex w-full max-w-[420px] flex-col items-start gap-[12px]">
        <h1 className={`w-full ${type.title}`}>That didn&apos;t go through</h1>
        <p className={`w-full ${type.body} text-atlas-slate`}>
          Atlas couldn&apos;t finish that request. Check your connection and try again.
        </p>
        <AtlasButton onClick={() => reset()}>Try again</AtlasButton>
        <Link href="/" className="atlas-hit self-center font-manrope text-[14px] font-semibold text-atlas-teal underline">
          Back to the map
        </Link>
      </div>
    </main>
  );
}
