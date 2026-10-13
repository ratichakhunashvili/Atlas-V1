import { ACTIVITY_LEVELS, BUDGET_LEVELS, PLACE_CATEGORIES } from "@/db/schema";
import { findCurrentStayForUser } from "@/db/queries/hotel-stays";
import { findPreferencesForUser } from "@/db/queries/preferences";
import { updatePreferencesAction } from "@/features/users/actions";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import { requireUser } from "@/lib/authorization";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
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

      <Card className="space-y-4">
        <h2 className="font-medium">Preferences (foundation for Advisor)</h2>
        {error && <Alert>{error}</Alert>}
        <form action={updatePreferencesAction} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700">Interested categories</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PLACE_CATEGORIES.map((category) => (
                <label key={category} className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    name="categories"
                    value={category}
                    defaultChecked={preferences?.categories.includes(category)}
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

          <Button type="submit">Save preferences</Button>
        </form>
      </Card>
    </div>
  );
}
