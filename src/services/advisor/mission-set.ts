/**
 * The guest's "missions" for a day: the stops of the plan they explicitly generated, seen as tasks to complete.
 *
 * There is deliberately NO second scheduler here. A mission is an itinerary stop, completed through the same
 * server-verified QR / GPS / camera check-in, so the eligibility rule, the stop order and the idempotent visit
 * write all stay in one place. What this module adds is the one rule missions have that plain routes did not:
 *
 *   A mission set must include at least one real, eligible, hotel-OWNED activity (one of the hotel's own facilities).
 *
 * When it does not, the set is reported as INCOMPLETE and says why — the hotel has configured no facility, or none
 * fits this plan — instead of being presented as valid. Nothing is invented to fill the gap: no filler stop, no
 * unapproved substitute.
 */

export type MissionGap = {
  reason: "no_hotel_activities_configured" | "none_fit_this_plan";
  message: string;
};

export type MissionSetSummary = {
  /** Tasks in the set: the active stops of the plan. */
  total: number;
  /** Tasks completed through a verified check-in. */
  completed: number;
  /** True only when at least one task is a hotel-owned activity. */
  hasHotelActivity: boolean;
  /** Why the set is not valid, or null when it is. */
  gap: MissionGap | null;
  /** A set is valid only with a hotel-owned activity. An incomplete one is shown as incomplete, never as valid. */
  valid: boolean;
};

export function summariseMissionSet(input: {
  stops: ReadonlyArray<{ placeId: string | null; visited: boolean }>;
  /** Ids of the Places that are this hotel's OWN facilities and currently eligible. Empty when it has none. */
  eligibleFacilityPlaceIds: ReadonlySet<string>;
}): MissionSetSummary {
  const total = input.stops.length;
  const completed = input.stops.filter((stop) => stop.visited).length;
  const hasHotelActivity = input.stops.some((stop) => stop.placeId !== null && input.eligibleFacilityPlaceIds.has(stop.placeId));

  if (hasHotelActivity) return { total, completed, hasHotelActivity: true, gap: null, valid: true };

  const gap: MissionGap =
    input.eligibleFacilityPlaceIds.size === 0
      ? {
          reason: "no_hotel_activities_configured",
          message:
            "Your hotel hasn't set up any of its own activities in Atlas yet, so these missions are incomplete: a full set always includes one.",
        }
      : {
          reason: "none_fit_this_plan",
          message:
            "None of your hotel's own activities fit this plan's interests, time or distance, so these missions are incomplete. Try a longer window or different interests.",
        };

  return { total, completed, hasHotelActivity: false, gap, valid: false };
}
