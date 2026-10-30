import { Alert } from "@/components/shared/alert";
import { Card } from "@/components/shared/card";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/authorization";
import { getCurrentItineraryForUser } from "@/services/advisor/current-itinerary";
import { shouldBlockDevelopmentOnlyPath } from "@/lib/development-route-policy";
import { CheckInTestForm } from "./check-in-test-form";
import { GenerateDevItineraryButton } from "../generate-itinerary-button";

/**
 * DEV/TEST ONLY — exercises the real GPS check-in server action
 * (features/advisor/actions.ts -> services/advisor/check-in.ts) against
 * today's real generated itinerary. Not the final Advisor UI: no styling
 * beyond what's needed to read results, and it deliberately lets you pick
 * ANY stop (not just the first unvisited one) so the "wrong stop" rejection
 * is exercisable from the browser, not just from a script.
 */
export default async function AdvisorCheckInDevPage() {
  if (shouldBlockDevelopmentOnlyPath("/dev/advisor-check-in", process.env.NODE_ENV, process.env.ATLAS_DEPLOYMENT_ENV)) notFound();
  const user = await requireAdmin();
  const itinerary = await getCurrentItineraryForUser(user.id);

  return (
    <div className="space-y-6">
      <Alert variant="error">
        Dev/test page — exercises the real GPS check-in server action. Not the final Advisor UI.
      </Alert>

      <h1 className="text-2xl font-semibold">Advisor GPS check-in (dev)</h1>
      <GenerateDevItineraryButton />

      {itinerary.status !== "ready" ? (
        <Card>
          <p className="text-sm text-slate-700">
            {itinerary.status === "no_active_stay"
              ? "There is no active hotel stay for this account."
              : `There is no itinerary yet for ${itinerary.hotelName}.`}
            {" "}Opening this page never creates or changes an itinerary; use the button above to request one explicitly.
          </p>
        </Card>
      ) : (
        <CheckInTestForm
          day={{
            dayNumber: itinerary.dayNumber,
            generatedAt: itinerary.generatedAt,
            completedAt: itinerary.completedAt,
          }}
          stops={itinerary.stops.map(({ id, position, name, isHotelStop, checkInMethod, visitedAt }) => ({
            id,
            position,
            name,
            isHotelStop,
            checkInMethod,
            visitedAt,
          }))}
        />
      )}
    </div>
  );
}
