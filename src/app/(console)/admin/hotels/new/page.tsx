import Link from "next/link";
import { HotelForm } from "@/components/hotel/hotel-form";
import { listPlaces } from "@/db/queries/places";
import { createHotelAction } from "@/features/hotels/actions";

export const metadata = { title: "New hotel" };

export default async function NewHotelPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const places = await listPlaces();
  // A hotel needs a place of its own: other hotels' places and archived places aren't offered (the server checks too).
  const candidates = places.filter((place) => place.archivedAt === null && place.kind !== "hotel");

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href="/admin" className="atlas-hit inline-block text-sm text-slate-600 underline">
          ← Hotels
        </Link>
        <h1 className="mt-2 text-xl font-semibold">New hotel</h1>
        <p className="text-sm text-slate-500">
          Choose the hotel&apos;s own place. Add it under Places first if it isn&apos;t there yet.
        </p>
      </div>
      <HotelForm action={createHotelAction} places={candidates} error={error} />
    </div>
  );
}
