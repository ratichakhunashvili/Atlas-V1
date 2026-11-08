"use client";

import { useEffect, useState } from "react";

/** The phone screen the app is laid out for (an iPhone 14/15-size viewport), in CSS px. */
const SCREEN_W = 390;
const SCREEN_H = 844;
const BEZEL = 12;
const MARGIN = 32;

/**
 * The real app in a phone-sized frame. The iframe has its own 390 px viewport, so every media query and layout hook in
 * the app sees a phone, exactly as on a device. On a short screen the whole phone scales down to fit, never up.
 */
export function PhoneFrame({ src }: { src: string }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => {
      const fullW = SCREEN_W + BEZEL * 2;
      const fullH = SCREEN_H + BEZEL * 2;
      setScale(Math.min(1, (window.innerHeight - MARGIN * 2) / fullH, (window.innerWidth - MARGIN * 2) / fullW));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <div
      className="shrink-0 rounded-[52px] bg-atlas-ink shadow-[0px_30px_80px_0px_rgba(0,0,0,0.35)]"
      style={{ padding: BEZEL, transform: `scale(${scale})`, transformOrigin: "center" }}
    >
      <iframe
        src={src}
        title="Atlas on a phone"
        // The app asks for location on the map and the camera when scanning; the frame passes both through.
        allow="geolocation; camera; fullscreen"
        className="block rounded-[40px] border-0 bg-atlas-paper"
        style={{ width: SCREEN_W, height: SCREEN_H }}
      />
    </div>
  );
}
