import Link from "next/link";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import { Field } from "@/components/shared/field";
import { findCurrentStayForUser } from "@/db/queries/hotel-stays";
import { findPreferencesForUser } from "@/db/queries/preferences";
import { checkInToHotelFormAction } from "@/features/hotel-stays/actions";
import { enterTestStayFormAction } from "@/features/test-entry/actions";
import { isTestEntryOffered } from "@/features/test-entry/offer";
import { requireUser } from "@/lib/authorization";
import { getEligibleMapPlacesForGuest } from "@/services/eligibility";
import { getCurrentItineraryForUser } from "@/services/advisor/current-itinerary";
import { listGuestPlaceModels } from "@/services/map3d";
import { AdvisorMapSection } from "./advisor-map-section";
import { GuestStartButton } from "@/components/guest/guest-app-shell";

/**
 * The guest's home. Three states, each of which has to make sense on its own:
 *
 *  - no stay: the only useful thing is starting one, so that is all this shows;
 *  - stay but no interests: the Advisor cannot plan anything yet, and says so
 *    rather than offering a button that will fail;
 *  - stay and interests: the map, the plan and the day.
 *
 * Every Place on this page comes from `getEligibleMapPlacesForGuest`, which derives
 * the hotel from the guest's own active stay — its facilities and its confirmed
 * partners. No request parameter widens that, and no valid stay means no Places at
 * all rather than "everything nearby".
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ checkinError?: string; checkinOk?: string }>;
}) {
  const { checkinError, checkinOk } = await searchParams;
  const user = await requireUser();
  const stay = await findCurrentStayForUser(user.id);

  const [{ places }, itinerary, preferences, models] = await Promise.all([
    getEligibleMapPlacesForGuest({ userId: user.id }),
    getCurrentItineraryForUser(user.id),
    findPreferencesForUser(user.id),
    // Only models for Places this guest's hotel has approved, with lock state from their own verified visits.
    listGuestPlaceModels(user.id),
  ]);

  const testEntryOffered = await isTestEntryOffered(user.id);
  const hasInterests = (preferences?.categories.length ?? 0) > 0;
  const activeStay = stay && stay.checkOut === null ? stay : null;

  return (
    <div className={`atlas-home${activeStay ? " atlas-home--map" : " atlas-home--start"}`}>
      {checkinError && <Alert>{checkinError}</Alert>}
      {checkinOk && <Alert variant="success">You&apos;re checked in to {checkinOk}.</Alert>}

      {!activeStay ? (
        <>
          <section className="atlas-start-card" aria-labelledby="atlas-start-title">
            <div className="atlas-brand-mark" aria-hidden="true">A</div>
            <p className="atlas-eyebrow">Your stay, well spent</p>
            <h1 id="atlas-start-title">Tell us when you&apos;re free.</h1>
            <p className="atlas-start-copy">
              We&apos;ll find hotel experiences and local places your hotel has approved, then help you make a day of it.
            </p>
            <GuestStartButton>Scan your hotel QR</GuestStartButton>
            <details className="atlas-manual-entry">
              <summary>Enter a hotel code instead</summary>
              <form action={checkInToHotelFormAction} className="atlas-manual-entry-form">
                <div className="min-w-0 flex-1">
                  <Field label="Hotel code" name="token" required autoComplete="off" />
                </div>
                <Button type="submit">Start stay</Button>
              </form>
            </details>
            {testEntryOffered && (
              <form action={enterTestStayFormAction} className="atlas-manual-entry-form">
                <Button type="submit" variant="secondary">
                  Open the test stay (non-production only)
                </Button>
              </form>
            )}
          </section>
        </>
      ) : (
        <>
          <div className="atlas-map-context" aria-label="Hotel context">
            <div className="atlas-brand-mark atlas-brand-mark--small" aria-hidden="true">A</div>
            <div>
              <h1>{activeStay.place.name}</h1>
              <p>{activeStay.place.address ?? "Your hotel and approved local experiences"}</p>
            </div>
            <Link href="/experiences" className="atlas-experiences-link">Experiences</Link>
          </div>

          {!hasInterests && (
            <Card className="atlas-inline-card space-y-2">
              <h2 className="font-medium">Pick your interests first</h2>
              <p className="text-sm text-slate-600">
                The Advisor builds your day out of the things you&apos;re interested in. Choose at least one and it
                can plan around the time you have.
              </p>
              <p>
                <Link href="/profile" className="text-sm text-slate-700 underline">
                  Choose interests
                </Link>
              </p>
            </Card>
          )}

          {places.length === 0 && (
            <Card className="atlas-inline-card space-y-1">
              <h2 className="font-medium">Nothing approved yet</h2>
              <p className="text-sm text-slate-600">
                {activeStay.place.name} hasn&apos;t approved any facilities or partners yet. Atlas only shows places
                your own hotel has signed off, so there is nothing to plan from until it does.
              </p>
            </Card>
          )}

          <AdvisorMapSection places={places} itinerary={itinerary} models={models} />
        </>
      )}
    </div>
  );
}
