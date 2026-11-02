import type { Metadata } from "next";
import { ScanScreen, type ScanEmpty, type ScanTarget } from "@/components/atlas-ui/scan-screens";
import type { CheckInMethod } from "@/db/schema";
import { requireUser } from "@/lib/authorization";
import { isCheckInMethodAllowed } from "@/services/advisor/check-in-method";
import { getDailyPlanForUser, type DailyPlanState } from "@/services/advisor/daily-plan";

/*
 * Scan · Scan (centre tab) — Figma frame 1:410, on real data: the camera checks in at the guest's own current stop.
 * Read-only: rendering this page starts, picks or completes nothing; the check-in itself is a server action.
 */

export const metadata: Metadata = { title: "Scan" };
export const dynamic = "force-dynamic";

function emptyState(state: DailyPlanState): ScanEmpty {
  switch (state.status) {
    case "no_stay":
      return state.reason === "outside_stay_period"
        ? { title: "Your stay has ended", body: "Your achievements are still yours to look back on.", action: { label: "See my achievements", href: "/achievements" } }
        : { title: "Join your hotel first", body: "Scan the Atlas code at reception or in your room to start.", action: { label: "Scan the hotel code", href: "/scan-hotel" } };
    case "not_started":
      return { title: "Plan your day first", body: "Tell us your interests and free time, then choose where to go.", action: { label: "Plan my day", href: "/preferences" } };
    case "choosing":
      return { title: "Choose where to go next", body: "Pick one of today's options, then scan its code when you get there.", action: { label: "Choose my next stop", href: "/plan" } };
    case "finished":
      return { title: "You're done for today", body: "Nothing left to check in at today.", action: { label: "Open my plan", href: "/plan" } };
    case "in_progress":
      return state.currentAvailable
        ? { title: "Check in from My plan", body: "This stop is checked in with the AR camera, not a QR code.", action: { label: "Open my plan", href: "/plan" } }
        : { title: "This stop isn't available", body: "It's no longer offered through your hotel. Fix it in your plan.", action: { label: "Open my plan", href: "/plan" } };
  }
}

/** A stop this screen can complete: by its QR code or by location. AR-only stops are checked in from My plan. */
function scannable(method: CheckInMethod) {
  return isCheckInMethodAllowed(method, "qr") || isCheckInMethodAllowed(method, "gps");
}

export default async function ScanPage() {
  const user = await requireUser();
  const state = await getDailyPlanForUser(user.id);
  const target: ScanTarget | null =
    state.status === "in_progress" && state.currentAvailable && scannable(state.current.checkInMethod)
      ? { stopId: state.current.id, name: state.current.name, checkInMethod: state.current.checkInMethod }
      : null;
  return <ScanScreen target={target} empty={emptyState(state)} />;
}
