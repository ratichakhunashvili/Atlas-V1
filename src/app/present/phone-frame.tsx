"use client";

import { useEffect, useState, type CSSProperties } from "react";

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
        className="block h-full w-full border-0 bg-atlas-paper sm:h-[var(--screen-h)] sm:w-[var(--screen-w)] sm:rounded-[40px]"
        style={{ "--screen-w": `${SCREEN_W}px`, "--screen-h": `${SCREEN_H}px` } as CSSProperties}
      />
    </div>
  );
}
