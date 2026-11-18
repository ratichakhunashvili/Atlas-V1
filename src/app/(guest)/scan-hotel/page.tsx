import type { Metadata } from "next";
import { HotelScanScreen } from "@/components/atlas-ui/scan-screens";
import { listJoinableHotels } from "@/db/queries/hotels";
import { isOpenJoinHotel, isTestHotelPickerAllowed } from "@/features/hotel-stays/test-hotel-picker";
import { currentSession, requireUser } from "@/lib/authorization";

/*
 * ScanHotel · Scan the hotel code — Figma frame 70:3730. The camera reads the hotel's code and opens its
 * /checkin/<token> landing, where the server checks it and the guest confirms the stay with an explicit button.
 */

export const metadata: Metadata = { title: "Scan the hotel code" };

export default async function ScanHotelPage() {
  await requireUser();
  const current = await currentSession();
  const tester = current.status === "signed-in" && isTestHotelPickerAllowed(current.account.email);
  const hotels = await listJoinableHotels();
  return <HotelScanScreen openHotels={hotels.filter((hotel) => isOpenJoinHotel(hotel.id))} testHotels={tester ? hotels : null} />;
}
