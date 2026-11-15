import { entryErrorPath } from "@/features/hotel-stays/entry-errors";
import { redirect } from "next/navigation";
import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import { enterHotelByToken, enterHotelFormAction, previewHotelEntryByToken } from "@/features/hotel-stays/actions";

/**
 * The "scan the hotel's QR code" entry point: a QR at the front desk encodes a
 * link to this page.
 *
 * A signed-in guest with no current stay is attached to the hotel as soon as they
 * scan (see the not_started branch for why that is safe on a page load). Nothing
 * else is written here: already staying here changes nothing, and a code that
 * doesn't work is explained.
 *
 * Switching hotels keeps its own deliberate steps: the button records the verified
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
    redirect(entryErrorPath(preview.error));
  }

  // Nothing to decide: they are already staying here. Still no write.
  if (preview.status === "already_here") {
    redirect(`/?checkinOk=${encodeURIComponent(preview.hotel.name)}`);
  }

  /*
   * No current stay: scanning the hotel's code IS the decision, so the stay starts now, without a button (owner
   * decision, 2026-11-16). Safe to do on this page load because:
   * - only a signed-in guest gets here (the proxy and requireUser send everyone else to sign in), so a chat app's
   *   link preview, which is never signed in as the guest, cannot start anyone's stay;
   * - nothing in the app links to this page, so nothing prefetches it;
   * - a reload or Back lands on "already_here" above and writes nothing more;
   * - enterHotelByToken runs every check again (code purpose, revocation, expiry, rate limit, concurrent entry).
   * Ending a current stay for another hotel is NOT automatic: that keeps the button and its confirmation below.
   */
  if (preview.status === "not_started") {
    const entered = await enterHotelByToken(token);
    if (!entered.ok) redirect(entryErrorPath(entered.error));
    if (entered.status === "switch_required") redirect("/checkin/confirm");
    redirect(`/?checkinOk=${encodeURIComponent(entered.hotel.name)}`);
  }

  // Only one case is left: the guest is staying at another hotel. Ending that stay takes their own yes.
  if (preview.status !== "switch_required") redirect("/");
  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-xl font-semibold">You scanned another hotel</h1>

      <Card className="space-y-3 text-sm">
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
      </Card>
    </div>
  );
}
