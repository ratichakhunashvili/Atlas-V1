import { redirect } from "next/navigation";
import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import {
  cancelHotelSwitchFormAction,
  confirmHotelSwitchFormAction,
  getPendingHotelSwitch,
} from "@/features/hotel-stays/actions";

/**
 * "You scanned another hotel's code — switch?"
 *
 * Everything on this screen comes from the guest's own server-held pending
 * switch, written when their scan was verified. The URL carries no token, the
 * HTML carries no token, and both buttons post actions that take no arguments —
 * so there is nothing here for a browser, a proxy log or a shared link to leak,
 * and nothing a tampered form value could redirect to a different hotel.
 *
 * Ending a stay and starting another is not something to do to someone silently
 * (approved 2026-10-14). Nothing has been written to their stay at this point.
 */
export default async function ConfirmHotelSwitchPage() {
  const pending = await getPendingHotelSwitch();

  if (!pending) {
    redirect("/?checkinError=That+request+expired.+Scan+the+hotel%27s+code+again.");
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-xl font-semibold">Switch hotels?</h1>
      <Card className="space-y-3 text-sm">
        <p>
          You&apos;re currently staying at <span className="font-medium">{pending.currentHotel.name}</span>.
        </p>
        <p>
          You scanned the code for <span className="font-medium">{pending.scannedHotel.name}</span>.
        </p>
        <p className="text-slate-600">
          Switching ends your stay at {pending.currentHotel.name} and starts one at {pending.scannedHotel.name}. Your
          completed visits stay in your history, but {pending.currentHotel.name}&apos;s experiences will no longer be
          offered to you.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <form action={confirmHotelSwitchFormAction}>
            <Button type="submit">Switch to {pending.scannedHotel.name}</Button>
          </form>
          <form action={cancelHotelSwitchFormAction}>
            <Button type="submit" variant="secondary">
              Stay at {pending.currentHotel.name}
            </Button>
          </form>
        </div>
        <p className="text-xs text-slate-500">
          This question expires after a few minutes. If it does, scan the hotel&apos;s code again.
        </p>
      </Card>
    </div>
  );
}
