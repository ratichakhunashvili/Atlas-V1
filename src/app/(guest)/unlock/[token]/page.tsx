import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authorization";
import { placeCodeHasTask } from "@/services/advisor/check-in-qr";
import { AtlasBadge, FlowScreen, Spacer, type } from "@/components/atlas-ui/ui";
import { PlaceCodeCheckIn } from "./place-code-check-in";

/*
 * Where a place's printed check-in code leads when a phone's own camera scans it (the code holds
 * <site>/unlock/<code>). Like /checkin/<code> for hotels, this GET only shows a button: the check-in
 * itself is the same server action the in-app scanner calls, which re-checks the guest, their plan's
 * current stop and the code's purpose. Signed-out visitors are sent to sign in or register first and come back
 * here; signed-in guests with no task for this place go to their Atlas home (placeCodeHasTask).
 */

export const metadata: Metadata = { title: "Check in" };

export default async function PlaceCodePage({ params }: { params: Promise<{ token: string }> }) {
  // Signed out (anyone scanning a partner's code): Atlas sign-in / register, then back here.
  const user = await requireUser();
  const { token } = await params;
  // Signed in but no task for this place right now: their Atlas home, not a check-in that would only refuse.
  if (!(await placeCodeHasTask({ userId: user.id, qrToken: token }))) redirect("/");

  return (
    <main>
      <FlowScreen>
        <div className="flex w-full flex-col items-start gap-[14px] pt-[48px]">
          <AtlasBadge icon="/atlas-ui/icon-qr-teal.svg" iconSize={29} tone="sand" />
          <h1 className={`w-full ${type.title}`}>Check in here</h1>
          <p className={`w-full ${type.body} text-atlas-ink`}>
            You scanned an Atlas check-in code. It counts for the stop you&apos;re on in today&apos;s plan.
          </p>
        </div>
        <Spacer />
        <PlaceCodeCheckIn token={token} />
      </FlowScreen>
    </main>
  );
}
