"use client";

import { useState } from "react";

/*
 * Switch (component 1:198) as the place form's "Verified switch": 52 x 32 track in a 60 x 44
 * target, named by the visible label beside it. Toggles locally; nothing is saved.
 */
export function AdminSwitch({ labelledBy, defaultOn = true }: { labelledBy: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelledBy}
      onClick={() => setOn(!on)}
      className="flex h-[44px] w-[60px] shrink-0 items-center justify-center"
    >
      <span className={`relative h-[32px] w-[52px] rounded-[16px] ${on ? "bg-atlas-teal" : "bg-atlas-mist"}`}>
        <span
          className={`absolute top-[3px] size-[26px] rounded-[13px] bg-white shadow-[0px_1px_3px_0px_rgba(28,41,41,0.3)] ${on ? "left-[23px]" : "left-[3px]"}`}
        />
      </span>
    </button>
  );
}
