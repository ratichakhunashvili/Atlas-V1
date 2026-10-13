import { Alert } from "@/components/shared/alert";
import { Card } from "@/components/shared/card";
import { requireUser } from "@/lib/authorization";
import { generateItineraryForUser } from "@/services/advisor/generate-itinerary";
import { CheckInTestForm } from "./check-in-test-form";

/**
 * DEV/TEST ONLY — exercises the real GPS check-in server action
 * (features/advisor/actions.ts -> services/advisor/check-in.ts) against
 * today's real generated itinerary. Not the final Advisor UI: no styling
 * beyond what's needed to read results, and it deliberately lets you pick
 * ANY stop (not just the first unvisited one) so the "wrong stop" rejection
 * is exercisable from the browser, not just from a script.
 */
export default async function AdvisorCheckInDevPage() {
  const user = await requireUser();

  const result = await generateItineraryForUser(user.id);

  return (
    <div className="space-y-6">
      <Alert variant="error">
        Dev/test page — exercises the real GPS check-in server action. Not the final Advisor UI.
      </Alert>

      <h1 className="text-2xl font-semibold">Advisor GPS check-in (dev)</h1>

      {!result.ok ? (
        <Card>
          <p className="text-sm text-slate-700">
            Could not load/generate an itinerary: <span className="font-medium">{result.reason}</span> —{" "}
            {result.message}
          </p>
        </Card>
      ) : (
        <CheckInTestForm day={result.itinerary.day} stops={result.itinerary.stops} regenerated={result.regenerated} />
      )}
    </div>
  );
}
