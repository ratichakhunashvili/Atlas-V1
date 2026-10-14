import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/shared/card";
import { buttonStyles } from "@/components/shared/button";
import { findDemoHotelByQrToken } from "@/prototype/eligibility";
import { FREE_TIME_OPTIONS, buildPlanQuery, parseFreeTime, parseInterests } from "@/prototype/plan";
import { StepHeader } from "../../_components/step-header";

/** Step 4: choose available free time. Interests arrive in the URL and are re-validated here. */
export default async function DemoTimePage({
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
  if (interests.length === 0) {
    redirect(`/demo/${token}?error=${encodeURIComponent("Pick at least one interest to continue.")}`);
  }
  const selectedMinutes = parseFreeTime(raw.minutes);

  return (
    <div className="space-y-6">
      <StepHeader step={4} title="How much time do you have?" subtitle={`Free time during your stay at ${hotel.name}.`} />

      <form action={`/demo/${token}/experiences`} method="get" className="space-y-4">
        {interests.map((interest) => (
          <input key={interest} type="hidden" name="interests" value={interest} />
        ))}
        <Card className="space-y-3">
          <fieldset className="space-y-3">
            <legend className="sr-only">Available free time</legend>
            {FREE_TIME_OPTIONS.map((option, index) => (
              <label
                key={option.minutes}
                className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 has-[:checked]:border-slate-900 has-[:checked]:bg-slate-50"
              >
                <input
                  type="radio"
                  name="minutes"
                  value={option.minutes}
                  defaultChecked={selectedMinutes === null ? index === 1 : selectedMinutes === option.minutes}
                  className="h-5 w-5"
                />
                <span className="text-sm font-medium">{option.label}</span>
              </label>
            ))}
          </fieldset>
        </Card>
        <button type="submit" className={`${buttonStyles.primary} w-full`}>
          Show what I can do
        </button>
        <Link href={`/demo/${token}?${buildPlanQuery({ interests, freeTimeMinutes: null })}`} className={`${buttonStyles.secondary} w-full`}>
          Back
        </Link>
      </form>
    </div>
  );
}
