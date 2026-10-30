"use client";

import { useState } from "react";
import { resetDemo } from "./demo-store";

/** Puts the demo plan, check-ins, choices and achievements back to the design's starting point. */
export function DemoResetButton() {
  const [done, setDone] = useState(false);
  return (
    <div className="flex w-full flex-col items-start gap-[6px]">
      <button
        type="button"
        onClick={() => {
          resetDemo();
          setDone(true);
        }}
        className="flex h-[44px] items-center rounded-[12px] border border-atlas-teal px-[14px] font-manrope text-[14px] font-semibold leading-[19px] text-atlas-teal"
      >
        Reset the demo
      </button>
      <p role="status" className="font-manrope text-[13px] leading-[18px] text-atlas-slate">
        {done ? "Back to the design's starting point: 2 h, Food and Culture, Partner Place 1 done." : null}
      </p>
    </div>
  );
}
