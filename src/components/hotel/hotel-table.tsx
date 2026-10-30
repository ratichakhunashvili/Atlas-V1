import Link from "next/link";
import type { HotelWithPlace } from "@/db/queries/hotels";
import { deleteHotelAction } from "@/features/hotels/actions";
import { Button } from "@/components/shared/button";
import { EmptyState } from "@/components/shared/empty-state";

export function HotelTable({ hotels }: { hotels: HotelWithPlace[] }) {
  if (hotels.length === 0) {
    return <EmptyState title="No hotels yet" description="Create the first hotel to get started." />;
  }

  return (
    <table className="w-full divide-y divide-slate-200 text-sm">
      <thead>
        <tr className="text-left text-slate-500">
          <th className="py-2">Place</th>
          <th className="py-2">Hotel entry QR</th>
          <th className="py-2" />
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {hotels.map((hotel) => (
          <tr key={hotel.id}>
            <td className="py-2 font-medium text-slate-900">{hotel.place.name}</td>
            <td className="py-2 text-xs text-slate-500">
              {hotel.entryCredentialIssuedAt ? "Issued (secret stored hashed)" : "Not issued"}
            </td>
            <td className="space-x-2 py-2 text-right">
              <Link href={`/admin/hotels/${hotel.id}`} className="text-slate-700 underline">
                Edit
              </Link>
              <form action={deleteHotelAction} className="inline">
                <input type="hidden" name="id" value={hotel.id} />
                <Button variant="danger" type="submit">
                  Delete
                </Button>
              </form>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
