import { Alert } from "@/components/shared/alert";
import { Card } from "@/components/shared/card";
import { requireUser } from "@/lib/authorization";
import { generateItineraryForUser } from "@/services/advisor/generate-itinerary";
import { findPlaceById } from "@/db/queries/places";
import { QrCheckInTestForm } from "./qr-check-in-test-form";

/**
 * DEV/TEST ONLY — exercises the real QR check-in server action
 * (features/advisor/actions.ts -> services/advisor/check-in-qr.ts) against
 * today's real generated itinerary. Not the final Advisor UI. Shows each
 * stop's Place qrToken directly (dev convenience for manual testing only —
 * never do this on a guest-facing page).
 */
export default async function AdvisorQrCheckInDevPage() {
  const user = await requireUser();

  const result = await generateItineraryForUser(user.id);

  if (!result.ok) {
    return (
      <div className="space-y-6">
        <Alert variant="error">Dev/test page — exercises the real QR check-in server action. Not the final Advisor UI.</Alert>
        <h1 className="text-2xl font-semibold">Advisor QR check-in (dev)</h1>
        <Card>
          <p className="text-sm text-slate-700">
            Could not load/generate an itinerary: <span className="font-medium">{result.reason}</span> — {result.message}
          </p>
        </Card>
      </div>
    );
  }

  const stopsWithTokens = await Promise.all(
    result.itinerary.stops.map(async (stop) => {
      const place = stop.placeId ? await findPlaceById(stop.placeId) : null;
      return { stop, qrToken: place?.qrToken ?? null };
    })
  );

  return (
    <div className="space-y-6">
      <Alert variant="error">Dev/test page — exercises the real QR check-in server action. Not the final Advisor UI.</Alert>

      <h1 className="text-2xl font-semibold">Advisor QR check-in (dev)</h1>

      <QrCheckInTestForm day={result.itinerary.day} stopsWithTokens={stopsWithTokens} regenerated={result.regenerated} />
    </div>
  );
}
