"use client";

import { useState } from "react";

/* Read more — Figma component 1:37: an About section that expands. "Read more" / "Show less". */

export function ReadMore({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="flex w-full flex-col items-start gap-[4px]">
      <h2 className="font-grotesk text-[16px] font-bold leading-[20px] text-atlas-teal">About</h2>
      <p
        className={`w-full font-manrope text-[15px] leading-[23px] text-atlas-ink ${
          expanded ? "" : "overflow-hidden text-ellipsis whitespace-nowrap"
        }`}
      >
        {text}
      </p>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="flex h-[44px] items-center font-manrope text-[14px] font-semibold leading-[19px] text-atlas-teal"
      >
        {expanded ? "Show less" : "Read more"}
      </button>
    </section>
  );
}
