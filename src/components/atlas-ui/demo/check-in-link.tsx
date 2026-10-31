"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { screenHref } from "../screen-hrefs";
import { chooseCheckIn } from "./demo-store";
import { checkInScreen } from "./live";
import type { StopId } from "./plan-model";

/**
 * "Check in" / "Unlock" for one planned stop: remembers which stop the guest chose, then opens
 * the scanner (partners), the camera view (attractions) or the check-in confirmation (hotel
 * facilities). Simulated: nothing is scanned or located.
 */
export function CheckInLink({ stop, className, children }: { stop: StopId; className: string; children: ReactNode }) {
  const href = screenHref(checkInScreen(stop)) ?? "/";
  return (
    <Link href={href} onClick={() => chooseCheckIn(stop)} className={className}>
      {children}
    </Link>
  );
}
