import { notFound } from "next/navigation";
import { HotelForm } from "@/components/hotel/hotel-form";
import { findHotelById } from "@/db/queries/hotels";
import { listPlaces } from "@/db/queries/places";
import { updateHotelAction } from "@/features/hotels/actions";

export default async function EditHotelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const [hotel, places] = await Promise.all([findHotelById(id), listPlaces()]);

  if (!hotel) {
    notFound();
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-semibold">Edit hotel</h1>
      <p className="text-sm text-slate-500">QR token: {hotel.qrToken}</p>
      <HotelForm
        action={updateHotelAction.bind(null, hotel.id)}
        places={places}
        currentPlaceId={hotel.placeId}
        error={error}
      />
    </div>
  );
}
