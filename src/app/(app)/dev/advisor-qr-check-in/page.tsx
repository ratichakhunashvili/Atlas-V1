import { Alert } from "@/components/shared/alert";
import { Card } from "@/components/shared/card";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/authorization";
import { getCurrentItineraryForUser } from "@/services/advisor/current-itinerary";
import { shouldBlockDevelopmentOnlyPath } from "@/lib/development-route-policy";
import { QrCheckInTestForm } from "./qr-check-in-test-form";
import { GenerateDevItineraryButton } from "../generate-itinerary-button";

/**
 * DEV/TEST ONLY — exercises the real QR check-in server action
 * (features/advisor/actions.ts -> services/advisor/check-in-qr.ts) against
 * today's existing itinerary. It never generates on render and never
 * receives a server-held Place QR token; test tokens must be scanned or
 * entered by the operator.
 */
export default async function AdvisorQrCheckInDevPage() {
  if (shouldBlockDevelopmentOnlyPath("/dev/advisor-qr-check-in", process.env.NODE_ENV, process.env.ATLAS_DEPLOYMENT_ENV)) notFound();
  const user = await requireAdmin();
  const itinerary = await getCurrentItineraryForUser(user.id);

  if (itinerary.status !== "ready") {
    return (
      <div className="space-y-6">
        <Alert variant="error">Dev/test page — exercises the real QR check-in server action. Not the final Advisor UI.</Alert>
        <h1 className="text-2xl font-semibold">Advisor QR check-in (dev)</h1>
        <GenerateDevItineraryButton />
        <Card>
          <p className="text-sm text-slate-700">
            {itinerary.status === "no_active_stay"
              ? "There is no active hotel stay for this account."
              : `There is no itinerary yet for ${itinerary.hotelName}.`}
            {" "}Opening this page never creates or changes an itinerary; use the button above to request one explicitly.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Alert variant="error">Dev/test page — exercises the real QR check-in server action. Not the final Advisor UI.</Alert>

      <h1 className="text-2xl font-semibold">Advisor QR check-in (dev)</h1>
      <GenerateDevItineraryButton />

      <QrCheckInTestForm
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
    </div>
  );
}
