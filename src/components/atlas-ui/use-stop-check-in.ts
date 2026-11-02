"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CheckInMethod } from "@/db/schema";
import { gpsCheckInFailureMessage, qrCheckInFailureMessage } from "@/app/(app)/advisor-messages";
import { checkInGpsAction, checkInQrAction } from "@/features/advisor/actions";
import { isCheckInMethodAllowed } from "@/services/advisor/check-in-method";
import { getCurrentPosition } from "@/services/location";

/*
 * Checking in at today's current stop, shared by My plan's "Go here now" card and the Scan tab. The browser only
 * forwards the scanned text or a position reading; the server decides everything. Success opens the stop's
 * Achievement unlocked screen.
 */
export function useStopCheckIn({ stopId, placeName }: { stopId: string; placeName: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<null | "qr" | "gps">(null);

  const unlocked = () => router.push(`/plan/unlocked?stop=${stopId}`);

  // Plain async handlers, not a transition: a navigation started after an awaited server action inside a
  // transition can be dropped, which left the guest on My plan after a successful check-in.
  /** Returns true when the guest is checked in and being sent on. */
  async function checkInWithCode(decodedText: string): Promise<boolean> {
    setError(null);
    setWorking("qr");
    try {
      const result = await checkInQrAction(decodedText);
      if (!result.ok) {
        setError(qrCheckInFailureMessage(result.reason));
        return false;
      }
      // A code for a place already done earlier today comes back as ok + alreadyVisited for that other stop.
      if (result.stop.id !== stopId) {
        setError(`You've already checked in there. Scan the Atlas code at ${placeName}.`);
        return false;
      }
      unlocked();
      return true;
    } catch {
      setError("We couldn't reach Atlas. Check your connection and try again.");
      return false;
    } finally {
      setWorking(null);
    }
  }

  async function checkInByLocation(): Promise<boolean> {
    setError(null);
    setWorking("gps");
    try {
      let position;
      try {
        position = await getCurrentPosition({ fresh: true });
      } catch (problem) {
        setError(problem instanceof Error ? `We couldn't get your location: ${problem.message}` : "We couldn't get your location.");
        return false;
      }
      const result = await checkInGpsAction(stopId, position.latitude, position.longitude, position.accuracyMeters, position.capturedAtMs);
      if (!result.ok) {
        setError(gpsCheckInFailureMessage(result.reason));
        return false;
      }
      unlocked();
      return true;
    } catch {
      setError("We couldn't reach Atlas. Check your connection and try again.");
      return false;
    } finally {
      setWorking(null);
    }
  }

  return { error, setError, working, checkInWithCode, checkInByLocation };
}

/** Which proofs this screen can offer for a stop: the server's own rule, asked for each way of checking in here. */
export function acceptedProofs(method: CheckInMethod): { qr: boolean; gps: boolean } {
  return { qr: isCheckInMethodAllowed(method, "qr"), gps: isCheckInMethodAllowed(method, "gps") };
}
