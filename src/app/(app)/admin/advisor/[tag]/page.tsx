import Link from "next/link";
import { Alert } from "@/components/shared/alert";
import {
  findAdvisorTestScenario,
  inspectItineraryStops,
  scenarioTypeFromTag,
  SCENARIO_LABELS,
} from "@/services/advisor-testing/scenario";
import { calculateDayNumber } from "@/services/advisor/stay-day";
import { findItineraryDay, listItineraryStops } from "@/db/queries/itinerary";
import { ScenarioTestPanel } from "./scenario-test-panel";

export default async function AdvisorTestScenarioPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  const scenario = await findAdvisorTestScenario(tag);

  if (!scenario) {
    return (
      <div className="space-y-4">
        <Alert variant="error">ADVISOR TESTING / ADMIN</Alert>
        <Alert>
          No test scenario found for <code>{tag}</code>. It may already have been deleted.
        </Alert>
        <Link href="/admin/advisor" className="text-sm text-slate-600 underline">
          Back to Advisor Testing
        </Link>
      </div>
    );
  }

  // Read-only: shows whatever already exists for "today" without ever
  // triggering generation itself — the explicit "Generate Itinerary" button
  // is the only thing that calls generateItineraryForUser.
  const now = new Date();
  const dayNumberResult = calculateDayNumber(scenario.checkIn, scenario.checkOut, now);
  const day = dayNumberResult.ok ? await findItineraryDay(scenario.user.id, scenario.hotelId, dayNumberResult.dayNumber) : null;
  const stops = day ? await listItineraryStops(day.id) : [];
  const inspectorStops = day ? await inspectItineraryStops(stops, scenario.partnerPlaceIds) : [];

  const hoursSinceGeneration = day ? (now.getTime() - day.generatedAt.getTime()) / 3600000 : null;
  const cooldownActive = hoursSinceGeneration !== null && hoursSinceGeneration < 24 && scenario.user.role !== "admin";
  const scenarioType = scenarioTypeFromTag(tag);

  return (
    <div className="space-y-6">
      <Alert variant="error">
        ADVISOR TESTING / ADMIN — scenario <code>{tag}</code>{" "}
        {scenarioType && `(${SCENARIO_LABELS[scenarioType]})`}. All
        actions below operate on real rows for this test user only.
      </Alert>

      <Link href="/admin/advisor" className="text-sm text-slate-600 underline">
        ← Back to Advisor Testing
      </Link>

      <ScenarioTestPanel
        tag={tag}
        scenario={{
          userId: scenario.user.id,
          userEmail: scenario.user.email,
          userRole: scenario.user.role,
          hotelId: scenario.hotelId,
          hotelPlaceId: scenario.hotelPlace.id,
          places: scenario.places.map((p) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            latitude: p.latitude,
            longitude: p.longitude,
            qrToken: p.qrToken,
            isPartner: scenario.partnerPlaceIds.has(p.id),
            partnerPriority: scenario.partnerPlaceIds.get(p.id) ?? null,
          })),
        }}
        day={
          day
            ? {
                id: day.id,
                dayNumber: day.dayNumber,
                stopCount: day.stopCount,
                totalDurationSeconds: day.totalDurationSeconds,
                hasRouteGeoJson: day.routeGeoJson !== null,
                generatedAt: day.generatedAt.toISOString(),
                completedAt: day.completedAt ? day.completedAt.toISOString() : null,
              }
            : null
        }
        stops={inspectorStops.map(({ stop, isPartner, qrToken }) => ({
          id: stop.id,
          position: stop.position,
          name: stop.name,
          category: stop.category,
          latitude: stop.latitude,
          longitude: stop.longitude,
          isHotelStop: stop.isHotelStop,
          checkInMethod: stop.checkInMethod,
          visitedAt: stop.visitedAt ? stop.visitedAt.toISOString() : null,
          isPartner,
          qrToken,
        }))}
        cooldownActive={cooldownActive}
      />
    </div>
  );
}
