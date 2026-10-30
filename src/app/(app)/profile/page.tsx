import { ACTIVITY_LEVELS, BUDGET_LEVELS, PLACE_CATEGORIES } from "@/db/schema";
import { logoutAction } from "@/auth/actions";
import Link from "next/link";
import { findCurrentStayForUser } from "@/db/queries/hotel-stays";
import { findPreferencesForUser } from "@/db/queries/preferences";
import { updatePreferencesAction } from "@/features/users/actions";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import { requireUser } from "@/lib/authorization";
import { DISTANCE_PREFERENCE_OPTIONS } from "@/features/users/schema";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error, saved } = await searchParams;
  const user = await requireUser();
  const [preferences, stay] = await Promise.all([
    findPreferencesForUser(user.id),
    findCurrentStayForUser(user.id),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Profile</h1>

      <Card className="space-y-2">
        <h2 className="font-medium">Account</h2>
        <p className="text-sm text-slate-600">Email: {user.email}</p>
        <p className="text-sm text-slate-600">Role: {user.role}</p>
        <form action={logoutAction} className="pt-2">
          <Button variant="secondary" type="submit">Sign out</Button>
        </form>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-medium">Current hotel stay</h2>
        {stay ? (
          <p className="text-sm text-slate-600">
            {stay.place.name} · checked in {stay.checkIn.toLocaleDateString()}
          </p>
        ) : (
          <p className="text-sm text-slate-500">No active hotel stay.</p>
        )}
      </Card>

      <Card className="space-y-2">
        <h2 className="font-medium">Achievements and visits</h2>
        <p className="text-sm text-slate-600">See the places you&apos;ve visited and the achievements you&apos;ve unlocked.</p>
        <Link href="/collection" className="inline-flex min-h-10 items-center font-medium text-slate-800 underline underline-offset-4">
          View your collection
        </Link>
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="font-medium">Your interests</h2>
          <p className="text-sm text-slate-600">
            The Advisor only suggests experiences your hotel has approved, and these choices decide which of them it
            picks from. Choose at least one — without any, there is nothing to build a day out of.
          </p>
        </div>
        {error && <Alert>{error}</Alert>}
        {saved && <Alert variant="success">Interests saved.</Alert>}
        {!error && !saved && (preferences?.categories.length ?? 0) === 0 && (
          <Alert>Pick at least one interest so the Advisor can plan a day for you.</Alert>
        )}
        <form action={updatePreferencesAction} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700">Interested categories</legend>
            {/* Whole-row labels, so the tap target on a phone is the row rather than the 16px box. */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PLACE_CATEGORIES.map((category) => (
                <label
                  key={category}
                  className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2.5 text-sm text-slate-700 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-slate-900 hover:border-slate-400"
                >
                  <input
                    type="checkbox"
                    name="categories"
                    value={category}
                    defaultChecked={preferences?.categories.includes(category)}
                    className="h-4 w-4"
                  />
                  {category}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Budget</span>
            <select
              name="budget"
              defaultValue={preferences?.budget ?? ""}
              className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">No preference</option>
              {BUDGET_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Activity level</span>
            <select
              name="activityLevel"
              defaultValue={preferences?.activityLevel ?? ""}
              className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">No preference</option>
              {ACTIVITY_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">How far will you go?</span>
            <select
              name="maxDistanceMeters"
              defaultValue={preferences?.maxDistanceMeters ?? ""}
              className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">No preference</option>
              {DISTANCE_PREFERENCE_OPTIONS.map((option) => (
                <option key={option.meters} value={option.meters}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="block text-xs text-slate-500">
              Atlas never plans beyond 5 km from your hotel; this can only make that smaller.
            </span>
          </label>

          <p className="text-xs text-slate-500">
            Budget ranks places whose price Atlas knows; places with no recorded price are never described as
            affordable. Activity level sets how many stops a plan can hold.
          </p>

          <Button type="submit">Save interests</Button>
        </form>
      </Card>
    </div>
  );
}
