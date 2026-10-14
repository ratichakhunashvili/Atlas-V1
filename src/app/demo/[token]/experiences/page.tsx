import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/shared/card";
import { buttonStyles } from "@/components/shared/button";
import { EmptyState } from "@/components/shared/empty-state";
import { findDemoHotelByQrToken, getEligibleExperiencesForDemoHotel } from "@/prototype/eligibility";
import {
  INTERESTS,
  buildPlanQuery,
  formatMinutes,
  parseFreeTime,
  parseInterests,
  selectExperiences,
  toExperienceView,
} from "@/prototype/plan";
import { StepHeader } from "../../_components/step-header";

/**
 * Step 5: eligible hotel experiences. The hotel comes ONLY from the QR token;
 * the eligible set comes from the prototype eligibility function; interests
 * only narrow it. Nothing in the URL can add a Place.
 */
export default async function DemoExperiencesPage({
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
  const query = buildPlanQuery({ interests, freeTimeMinutes });
  const interestLabels = INTERESTS.filter((interest) => interests.includes(interest.id)).map((interest) => interest.label);

  return (
    <div className="space-y-6">
      <StepHeader
        step={5}
        title={`What ${hotel.name} offers you`}
        subtitle={`${interestLabels.join(", ")} · ${formatMinutes(freeTimeMinutes)} free`}
      />

      {experiences.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            title="No hotel-approved experiences match yet"
            description={`${hotel.name} doesn’t have a facility or approved partner for these interests. Try different interests — we only show what your hotel has approved.`}
          />
          <Link href={`/demo/${token}?${buildPlanQuery({ interests, freeTimeMinutes: null })}`} className={`${buttonStyles.secondary} w-full`}>
            Change interests
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <ul className="space-y-3">
            {experiences.map((experience) => (
              <li key={experience.id}>
                <Card className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-medium">{experience.name}</h2>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{experience.kind}</span>
                  </div>
                  {experience.description && <p className="text-sm text-slate-600">{experience.description}</p>}
                  <p className="text-xs text-slate-500">About {formatMinutes(experience.visitMinutes)}</p>
                </Card>
              </li>
            ))}
          </ul>
          <Link href={`/demo/${token}/itinerary?${query}`} className={`${buttonStyles.primary} w-full`}>
            See my itinerary preview
          </Link>
          <Link href={`/demo/${token}/time?${query}`} className={`${buttonStyles.secondary} w-full`}>
            Back
          </Link>
        </div>
      )}
    </div>
  );
}
