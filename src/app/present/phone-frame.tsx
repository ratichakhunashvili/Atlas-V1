"use client";

import { useEffect, useRef, useState, type CSSProperties, type SyntheticEvent } from "react";

const PHONE_STYLE_ID = "atlas-present-phone";
/**
 * Scrollbars hidden (scrolling still works) and no sideways page scroll, like on a phone. `clip` on the root only:
 * `hidden` on body would make body its own scroll area and break the app's sticky bottom bar.
 */
export const PHONE_STYLE =
  "html{overflow-x:clip;overscroll-behavior-x:none}*{scrollbar-width:none}*::-webkit-scrollbar{display:none;width:0;height:0}";

/** The phone screen the app is laid out for (an iPhone 14/15-size viewport), in CSS px. */
const SCREEN_W = 390;
const SCREEN_H = 844;
const BEZEL = 12;
const MARGIN = 32;
/** Room kept under the phone for the caption on wide screens. */
const CAPTION_H = 40;

/**
 * The real app in a phone-sized frame. The iframe has its own 390 px viewport, so every media query and layout hook in
 * the app sees a phone, exactly as on a device. On a short screen the whole phone scales down to fit, never up.
 * On a phone-sized screen (below Tailwind's `sm`, 640 px) there is no frame at all: the app fills the screen, so
 * a phone is never drawn inside a phone.
 */
export function PhoneFrame({ src }: { src: string }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => {
      const fullW = SCREEN_W + BEZEL * 2;
      const fullH = SCREEN_H + BEZEL * 2;
      setScale(Math.min(1, (window.innerHeight - MARGIN * 2 - CAPTION_H) / fullH, (window.innerWidth - MARGIN * 2) / fullW));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  /*
   * A phone draws no scrollbar, but a laptop browser (Chrome/Edge on Windows) draws a ~15 px one inside the frame.
   * That took 15 px from the 390 px phone screen, so screens that scroll (Plan, Profile) became 15 px too wide and
   * could be scrolled sideways. Inside the frame only, scrollbars are hidden (scrolling still works) and sideways
   * scrolling of the page is switched off. The frame shows this same site, so its document can be styled; this runs
   * again after every navigation inside the frame. The app itself, opened normally, is unchanged.
   */
  const frameRef = useRef<HTMLIFrameElement>(null);
  const fitLikeAPhone = (frame: HTMLIFrameElement | null) => {
    try {
      const doc = frame?.contentDocument;
      if (!doc?.head || doc.getElementById(PHONE_STYLE_ID)) return;
      const style = doc.createElement("style");
      style.id = PHONE_STYLE_ID;
      style.textContent = PHONE_STYLE;
      doc.head.appendChild(style);
    } catch {
      // Not this site's page (should not happen: ?path only accepts this site's paths). Leave it as it is.
    }
  };
  // The first page may finish loading before React attaches onLoad, so it is also applied once on mount.
  useEffect(() => {
    if (frameRef.current?.contentDocument?.readyState === "complete") fitLikeAPhone(frameRef.current);
  }, []);

  return (
    <div
      className="h-dvh w-full sm:h-auto sm:w-auto sm:shrink-0 sm:rounded-[52px] sm:bg-atlas-ink sm:p-[var(--bezel)] sm:shadow-[0px_30px_80px_0px_rgba(0,0,0,0.35)] sm:[transform:scale(var(--scale))]"
      style={{ "--bezel": `${BEZEL}px`, "--scale": scale } as CSSProperties}
    >
      <iframe
        src={src}
        title="Atlas on a phone"
        // The app asks for location on the map and the camera when scanning; the frame passes both through.
        allow="geolocation; camera; fullscreen"
        ref={frameRef}
        onLoad={(event: SyntheticEvent<HTMLIFrameElement>) => fitLikeAPhone(event.currentTarget)}
        className="block h-full w-full border-0 bg-atlas-paper sm:h-[var(--screen-h)] sm:w-[var(--screen-w)] sm:rounded-[40px]"
        style={{ "--screen-w": `${SCREEN_W}px`, "--screen-h": `${SCREEN_H}px` } as CSSProperties}
      />
    </div>
  );
}
