import type { Metadata } from "next";
import { HotelScanScreen } from "@/components/atlas-ui/scan-screens";
import { requireUser } from "@/lib/authorization";

/*
 * ScanHotel · Scan the hotel code — Figma frame 70:3730. The camera reads the hotel's code and opens its
 * /checkin/<token> landing, where the server checks it and the guest confirms the stay with an explicit button.
 */

export const metadata: Metadata = { title: "Scan the hotel code" };

export default async function ScanHotelPage() {
  await requireUser();
  return <HotelScanScreen />;
}
