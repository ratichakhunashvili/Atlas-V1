import { notFound } from "next/navigation";
import { Alert } from "@/components/shared/alert";
import { Card } from "@/components/shared/card";
import { buttonStyles } from "@/components/shared/button";
import { findDemoHotelByQrToken } from "@/prototype/eligibility";
import { INTERESTS, parseInterests } from "@/prototype/plan";
import { StepHeader } from "../_components/step-header";

/** Steps 2 + 3: the hotel is identified from the demo QR token in the URL, then the guest chooses interests. */
export default async function DemoInterestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ interests?: string | string[]; error?: string }>;
}) {
  const { token } = await params;
  const { interests, error } = await searchParams;

  const hotel = findDemoHotelByQrToken(token);
  if (!hotel) notFound();

  const selected = parseInterests(interests);

  return (
    <div className="space-y-6">
      <StepHeader step={2} title={`You’re at ${hotel.name}`} subtitle={`${hotel.tagline}. We recognised your hotel from the QR link.`} />

      <form action={`/demo/${token}/time`} method="get" className="space-y-4">
        <Card className="space-y-4">
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-slate-700">Step 3 · What are you into?</legend>
            {error && <Alert>{error}</Alert>}
            {INTERESTS.map((interest) => (
              <label
                key={interest.id}
                className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 has-[:checked]:border-slate-900 has-[:checked]:bg-slate-50"
              >
                <input
                  type="checkbox"
                  name="interests"
                  value={interest.id}
                  defaultChecked={selected.includes(interest.id)}
                  className="h-5 w-5"
                />
                <span className="text-sm font-medium">{interest.label}</span>
              </label>
            ))}
          </fieldset>
        </Card>
        <button type="submit" className={`${buttonStyles.primary} w-full`}>
          Continue
        </button>
      </form>
    </div>
  );
}
