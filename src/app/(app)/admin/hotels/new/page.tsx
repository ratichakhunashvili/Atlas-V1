import { HotelForm } from "@/components/hotel/hotel-form";
import { listPlaces } from "@/db/queries/places";
import { createHotelAction } from "@/features/hotels/actions";

export default async function NewHotelPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const places = await listPlaces();

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-semibold">New hotel</h1>
      <HotelForm action={createHotelAction} places={places} error={error} />
    </div>
  );
}
