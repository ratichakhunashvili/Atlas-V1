import type { Metadata } from "next";
import { requireUser } from "@/lib/authorization";
import { AtlasBadge, FlowScreen, Spacer, type } from "@/components/atlas-ui/ui";
import { PlaceCodeCheckIn } from "./place-code-check-in";

/*
 * Where a place's printed check-in code leads when a phone's own camera scans it (the code holds
 * <site>/unlock/<code>). Like /checkin/<code> for hotels, this GET only shows a button: the check-in
 * itself is the same server action the in-app scanner calls, which re-checks the guest, their plan's
 * current stop and the code's purpose. Signed-out guests are sent to sign in first and come back here.
 */

export const metadata: Metadata = { title: "Check in" };

export default async function PlaceCodePage({ params }: { params: Promise<{ token: string }> }) {
  await requireUser();
  const { token } = await params;

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
