"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { qrCheckInFailureMessage } from "@/app/(app)/advisor-messages";
import { AtlasButton, type } from "@/components/atlas-ui/ui";
import { checkInQrAction } from "@/features/advisor/actions";

/** The one deliberate step: the guest presses the button, then the server decides. */
export function PlaceCodeCheckIn({ token }: { token: string }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkIn() {
    setError(null);
    setWorking(true);
    try {
      const result = await checkInQrAction(token);
      if (!result.ok) {
        setError(qrCheckInFailureMessage(result.reason));
        return;
      }
      router.push(`/plan/unlocked?stop=${result.stop.id}`);
    } catch {
      setError("We couldn't reach Atlas. Check your connection and try again.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-start gap-[8px]">
      {error ? (
        <p role="alert" className={`w-full ${type.body} text-atlas-danger`}>
          {error}
        </p>
      ) : null}
      <AtlasButton onClick={() => void checkIn()} disabled={working}>
        {working ? "Checking in…" : "Check in"}
      </AtlasButton>
      <AtlasButton to="MyPlan" tone="outline">
        Open my plan
      </AtlasButton>
    </div>
  );
}
