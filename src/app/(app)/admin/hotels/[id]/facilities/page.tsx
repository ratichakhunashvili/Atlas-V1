import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Select } from "@/components/shared/select";
import { listFacilitiesForAdmin } from "@/db/queries/hotel-facilities";
import { findHotelById } from "@/db/queries/hotels";
import { listPlaces } from "@/db/queries/places";
import { FACILITY_TYPES } from "@/db/schema";
import { activateFacilityAction, addFacilityAction, deactivateFacilityAction } from "@/features/facilities/actions";

export default async function HotelFacilitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { error, ok } = await searchParams;
  const hotel = await findHotelById(id);
  if (!hotel) notFound();

  const [rows, places] = await Promise.all([listFacilitiesForAdmin(hotel.id), listPlaces()]);
  const taken = new Set(rows.map((row) => row.place.id));
  const registrable = places.filter((place) => place.archivedAt === null && place.id !== hotel.placeId && !taken.has(place.id));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/hotels/${hotel.id}`} className="text-sm text-slate-600 underline">
          ← {hotel.place.name}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Hotel-owned facilities — {hotel.place.name}</h1>
        <p className="text-sm text-slate-500">
          Facilities the hotel itself owns (pool, spa, restaurant…). Eligible for this hotel&apos;s guests only, with no external
          partnership. External businesses belong under &quot;External partners&quot; instead.
        </p>
      </div>

      {error && <Alert>{error}</Alert>}
      {ok && <Alert variant="success">{ok}</Alert>}

      <Card className="space-y-3">
        <h2 className="font-medium">Add a facility</h2>
        <form action={addFacilityAction.bind(null, hotel.id)} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[14rem] flex-1">
            <Select label="Place" name="placeId" defaultValue="" required>
              <option value="" disabled>
                Select a place…
              </option>
              {registrable.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name} ({place.category})
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-[10rem]">
            <Select label="Facility type" name="facilityType" defaultValue="" required>
              <option value="" disabled>
                Select a type…
              </option>
              {FACILITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replace("_", " ")}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit">Add facility</Button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="No facilities yet" />
      ) : (
        <div className="space-y-4">
          {rows.map(({ facility, place }) => (
            <Card key={facility.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900">{place.name}</p>
                <p className="text-xs text-slate-500">
                  {facility.facilityType.replace("_", " ")} · {facility.status}
                  {place.archivedAt ? " · place archived" : ""}
                </p>
              </div>
              {facility.status === "active" ? (
                <form action={deactivateFacilityAction.bind(null, facility.id)}>
                  <Button variant="secondary" type="submit">
                    Deactivate
                  </Button>
                </form>
              ) : (
                <form action={activateFacilityAction.bind(null, facility.id)}>
                  <Button variant="secondary" type="submit">
                    Activate
                  </Button>
                </form>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
