import { redirect } from "next/navigation";
import { checkInToHotelByToken } from "@/features/hotel-stays/actions";

/**
 * The "scan the hotel's QR code" entry point: a QR at the front desk encodes
 * a link to this page. No UI is rendered — like Map Advisor's /unlock/[token]
 * precedent, this always redirects to the home page with a status message.
 * requireUser() (inside checkInToHotelByToken) sends a logged-out visitor to
 * /login first; the (app) layout's own requireUser() covers the same case
 * before this page body even runs.
 */
export default async function CheckInPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await checkInToHotelByToken(token);

  if (!result.ok) {
    redirect(`/?checkinError=${encodeURIComponent(result.error)}`);
  }

  redirect(`/?checkinOk=${encodeURIComponent(result.hotel.name)}`);
}
