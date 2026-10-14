import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/shared/card";
import { buttonStyles } from "@/components/shared/button";
import { EmptyState } from "@/components/shared/empty-state";
import { findDemoHotelByQrToken, getEligibleExperiencesForDemoHotel } from "@/prototype/eligibility";
import {
  PLACEHOLDER_TRAVEL_MINUTES,
  buildItineraryPreview,
  buildPlanQuery,
  formatMinutes,
  parseFreeTime,
  parseInterests,
  selectExperiences,
  toExperienceView,
} from "@/prototype/plan";
import { StepHeader } from "../../_components/step-header";

/** Step 6: a simple itinerary PREVIEW built only from the eligible experiences. Not the production Advisor — no routing, GPS or real travel times. */
export default async function DemoItineraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ interests?: string | string[]; minutes?: string | string[] }>;
}) {
  const { token } = await params;
  const raw = await searchParams;

  const hotel = findDemoHotelByQrToken(token);
  if (!hotel) notFound();

  const interests = parseInterests(raw.interests);
  const freeTimeMinutes = parseFreeTime(raw.minutes);
  if (interests.length === 0) {
    redirect(`/demo/${token}?error=${encodeURIComponent("Pick at least one interest to continue.")}`);
  }
  if (freeTimeMinutes === null) {
    redirect(`/demo/${token}/time?${buildPlanQuery({ interests, freeTimeMinutes: null })}`);
  }

  const experiences = selectExperiences(getEligibleExperiencesForDemoHotel(hotel.id), interests).map(toExperienceView);
  const preview = buildItineraryPreview(experiences, freeTimeMinutes);
  const query = buildPlanQuery({ interests, freeTimeMinutes });

  return (
    <div className="space-y-6">
      <StepHeader
        step={6}
        title="Your itinerary preview"
        subtitle={`${hotel.name} · ${formatMinutes(freeTimeMinutes)} free · this is a preview, not a booking.`}
      />

      {preview.stops.length === 0 ? (
        <EmptyState
          title="Nothing fits yet"
          description="No hotel-approved experience fits these interests and this much time. Try more time or different interests — we won’t suggest places your hotel hasn’t approved."
        />
      ) : (
        <ol className="space-y-3">
          {preview.stops.map((stop, index) => (
            <li key={stop.experience.id}>
              <Card className="space-y-1 p-4">
                <p className="text-xs font-medium text-slate-500">
                  Stop {index + 1} · {formatMinutes(stop.startMinute)} – {formatMinutes(stop.endMinute)}
                </p>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-medium">{stop.experience.name}</h2>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{stop.experience.kind}</span>
                </div>
                {stop.experience.description && <p className="text-sm text-slate-600">{stop.experience.description}</p>}
              </Card>
            </li>
          ))}
        </ol>
      )}

      {preview.stops.length > 0 && (
        <p className="text-xs text-slate-500">
          Total about {formatMinutes(preview.totalMinutes)}, using a fixed {PLACEHOLDER_TRAVEL_MINUTES}-minute placeholder between stops
          (no real routing in this prototype). Returning to {hotel.name} is not modelled.
        </p>
      )}

      {preview.leftOut.length > 0 && (
        <p className="text-sm text-slate-600">
          Didn’t fit in your time: {preview.leftOut.map((experience) => experience.name).join(", ")}.
        </p>
      )}

      <div className="space-y-3">
        <Link href={`/demo/${token}/experiences?${query}`} className={`${buttonStyles.secondary} w-full`}>
          Back to experiences
        </Link>
        <Link href="/demo" className={`${buttonStyles.secondary} w-full`}>
          Start over
        </Link>
      </div>
    </div>
  );
}
