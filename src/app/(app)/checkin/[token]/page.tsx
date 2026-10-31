import { redirect } from "next/navigation";
import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import { enterHotelFormAction, previewHotelEntryByToken } from "@/features/hotel-stays/actions";

/**
 * The "scan the hotel's QR code" entry point: a QR at the front desk encodes a
 * link to this page.
 *
 * This GET is READ-ONLY. It resolves the credential, looks at the guest's current
 * stay, and renders what the code means — it starts nothing. A GET that writes is
 * a GET that fires again on a reload, a back button, a prefetch or a link preview,
 * and none of those is a guest deciding to check in. The write happens when they
 * press the button, which posts a Server Function.
 *
 * Switching hotels keeps its own second step: the button records the verified
 * hotel as a pending switch and sends the guest to /checkin/confirm, which carries
 * no token and asks before ending a stay.
 *
 * requireUser() (inside the action) sends a logged-out visitor to /login first;
 * the (app) layout's own requireUser() covers the same case before this body runs.
 */
export default async function CheckInPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await previewHotelEntryByToken(token);

  if (!preview.ok) {
    redirect(`/?checkinError=${encodeURIComponent(preview.error)}`);
  }

  // Nothing to decide: they are already staying here. Still no write.
  if (preview.status === "already_here") {
    redirect(`/?checkinOk=${encodeURIComponent(preview.hotel.name)}`);
  }

  const heading = preview.status === "switch_required" ? "You scanned another hotel" : "Start your stay";

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-xl font-semibold">{heading}</h1>

      <Card className="space-y-3 text-sm">
        {preview.status === "switch_required" ? (
          <>
            <p>
              This code is for <span className="font-medium">{preview.scannedHotel.name}</span>, but you&apos;re
              currently staying at <span className="font-medium">{preview.currentHotel.name}</span>.
            </p>
            <p className="text-slate-600">
              Nothing has changed yet. Continue and we&apos;ll ask you to confirm before ending your current stay.
            </p>
            <form action={enterHotelFormAction.bind(null, token)}>
              <Button type="submit">Continue</Button>
            </form>
          </>
        ) : (
          <>
            <p>
              This code is for <span className="font-medium">{preview.hotel.name}</span>.
            </p>
            <p className="text-slate-600">
              Starting your stay lets Atlas show you what {preview.hotel.name} has approved for its guests.
            </p>
            <form action={enterHotelFormAction.bind(null, token)}>
              <Button type="submit">Start my stay at {preview.hotel.name}</Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
