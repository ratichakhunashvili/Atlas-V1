"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { AtlasIcon } from "./asset";
import { screenHref, type ScreenKey } from "./screen-hrefs";

/*
 * Navigation helpers that need the browser.
 *
 * NavigationMemory remembers the previous in-app page for this tab, so a place's back button can
 * return to wherever the guest opened it from (map, list, plan, achievements) instead of always
 * the map. Without that memory — a page opened directly — it falls back to the design's target.
 */

const PREVIOUS = "atlas-nav-previous";
const CURRENT = "atlas-nav-current";

export function NavigationMemory() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      const current = window.sessionStorage.getItem(CURRENT);
      if (current && current !== pathname) window.sessionStorage.setItem(PREVIOUS, current);
      window.sessionStorage.setItem(CURRENT, pathname);
    } catch {
      // Storage unavailable: back buttons use their design targets.
    }
  }, [pathname]);
  return null;
}

function cameFromApp(): boolean {
  try {
    return window.history.length > 1 && Boolean(window.sessionStorage.getItem(PREVIOUS));
  } catch {
    return false;
  }
}

/** The design's back button, returning to the previous in-app page when there is one. */
export function HistoryBackButton({ fallback, className = "" }: { fallback: ScreenKey; className?: string }) {
  const router = useRouter();
  const href = screenHref(fallback) ?? "/";
  return (
    <Link
      href={href}
      aria-label="Back"
      onClick={(event) => {
        if (!cameFromApp()) return;
        event.preventDefault();
        router.back();
      }}
      className={`flex size-[44px] shrink-0 items-center justify-center rounded-[12px] border border-atlas-beige bg-atlas-paper ${className}`}
    >
      <AtlasIcon src="/atlas-ui/icon-back.svg" size={20} />
    </Link>
  );
}

/**
 * An action the design shows but this prototype cannot perform (calling the hotel, emailing
 * support, switching language). Pressing it says so instead of pretending, or of sending the
 * guest somewhere unrelated.
 */
export function DemoAction({
  className,
  label,
  notice,
  children,
  noticeClassName = "",
}: {
  className: string;
  /** Accessible name when the content is only an icon. */
  label?: string;
  notice: string;
  children: ReactNode;
  noticeClassName?: string;
}) {
  const [shown, setShown] = useState(false);
  const id = useId();
  return (
    <>
      <button type="button" aria-label={label} aria-describedby={shown ? id : undefined} onClick={() => setShown(true)} className={className}>
        {children}
      </button>
      {shown ? (
        <span
          id={id}
          role="status"
          className={`block w-full rounded-[10px] bg-atlas-sand px-[10px] py-[8px] font-manrope text-[13px] leading-[18px] text-atlas-ink ${noticeClassName}`}
        >
          {notice}
        </span>
      ) : null}
    </>
  );
}

export const FRONT_DESK_NOTICE = "Calling isn't connected in this prototype. The real app will use the number Hotel A provides.";
