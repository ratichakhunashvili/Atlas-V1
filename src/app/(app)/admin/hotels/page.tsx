import Link from "next/link";
import { HotelTable } from "@/components/hotel/hotel-table";
import { buttonStyles } from "@/components/shared/button";
import { listHotelsWithPlace } from "@/db/queries/hotels";

export default async function AdminHotelsPage() {
  const hotels = await listHotelsWithPlace();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Hotels</h1>
        <Link href="/admin/hotels/new" className={buttonStyles.primary}>
          New hotel
        </Link>
      </div>
      <HotelTable hotels={hotels} />
    </div>
  );
}
