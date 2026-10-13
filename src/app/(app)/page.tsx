import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import { Field } from "@/components/shared/field";
import { findCurrentStayForUser } from "@/db/queries/hotel-stays";
import { listPlacesNear } from "@/db/queries/places";
import { checkInToHotelFormAction } from "@/features/hotel-stays/actions";
import { requireUser } from "@/lib/authorization";
import { GEORGIA_CENTER } from "@/services/mapbox/georgiaBoundary";
import { getCurrentItineraryForUser } from "@/services/advisor/current-itinerary";
import { AdvisorMapSection } from "./advisor-map-section";

// Initial, broad radius for the first server render (no browser GPS yet at
// this point — see AtlasMap, which narrows to a 5km radius once the client's
// real location resolves). ~covers Georgia at Phase 2's place counts; revisit
// if the catalog grows enough that "everything in range" stops being cheap.
const INITIAL_RADIUS_M = 300_000;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ checkinError?: string; checkinOk?: string }>;
}) {
  const { checkinError, checkinOk } = await searchParams;
  const user = await requireUser();
  const stay = await findCurrentStayForUser(user.id);

  const center = stay
    ? { lat: stay.place.latitude, lng: stay.place.longitude }
    : { lat: GEORGIA_CENTER[1], lng: GEORGIA_CENTER[0] };
  const places = await listPlacesNear(center, INITIAL_RADIUS_M);
  const itinerary = await getCurrentItineraryForUser(user.id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Atlas</h1>

      {checkinError && <Alert>{checkinError}</Alert>}
      {checkinOk && <Alert variant="success">Checked in to {checkinOk}.</Alert>}

      <Card className="space-y-2">
        <p>
          <span className="font-medium">Current user:</span> {user.email}
        </p>
        <p>
          <span className="font-medium">Current hotel:</span>{" "}
          {stay ? stay.place.name : "Not currently checked in to a hotel"}
        </p>
        {stay && (
          <p>
            <span className="font-medium">Place information:</span>{" "}
            {stay.place.address ?? "No address on file"}
          </p>
        )}
      </Card>

      {!stay && (
        <Card className="space-y-3">
          <div>
            <h2 className="font-medium">Check in (dev)</h2>
            <p className="text-sm text-slate-500">
              Production entry point is scanning a hotel&apos;s QR code (opens{" "}
              <code>/checkin/&lt;token&gt;</code>). Until scanning is built, paste a
              hotel&apos;s QR token here — find one on its admin edit page.
            </p>
          </div>
          <form action={checkInToHotelFormAction} className="flex flex-wrap items-end gap-2">
            <div className="min-w-[16rem] flex-1">
              <Field label="Hotel QR token" name="token" required />
            </div>
            <Button type="submit">Check in</Button>
          </form>
        </Card>
      )}

      <AdvisorMapSection places={places} itinerary={itinerary} />

      <Card className="space-y-1 text-sm text-slate-500">
        <p>Achievements coming in Phase 4</p>
      </Card>
    </div>
  );
}
