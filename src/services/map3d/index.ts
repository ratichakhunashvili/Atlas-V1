import { buildGuestModels, type GuestPlaceModel, type ModelSource } from "./guest-models";

export { buildGuestModels } from "./guest-models";
export type { GuestPlaceModel, ModelSource } from "./guest-models";
export * from "./anchor";
export * from "./upload";

/**
 * The models one authenticated guest may see, with their lock state.
 *
 * Both inputs are resolved from the session on the server:
 *
 *  - the eligible Places come from `services/eligibility`, which derives the hotel
 *    from the guest's own active stay;
 *  - the unlocked Places come from that guest's own permanent verified visits.
 *
 * No request parameter widens either. A guest with no valid stay gets nothing,
 * rather than every model in the database.
 */
export type GuestModelDependencies = {
  listEligiblePlaceIds: (userId: string, now: Date) => Promise<string[]>;
  listModelsForPlaces: (placeIds: readonly string[]) => Promise<ModelSource[]>;
  listVisitedPlaceIds: (userId: string) => Promise<string[]>;
};

async function loadDefaultDependencies(): Promise<GuestModelDependencies> {
  const [eligibilityM, modelsQ, visitsQ] = await Promise.all([
    import("@/services/eligibility"),
    import("@/db/queries/place-models"),
    import("@/db/queries/place-visits"),
  ]);

  return {
    listEligiblePlaceIds: async (userId) => {
      const result = await eligibilityM.getEligibleMapPlacesForGuest({ userId });
      return result.places.map((place) => place.id);
    },
    listModelsForPlaces: (placeIds) => modelsQ.listModelsForPlaces(placeIds),
    listVisitedPlaceIds: async (userId) => {
      const visits = await visitsQ.listPlaceVisitsForUser(userId);
      return visits.map((visit) => visit.placeId);
    },
  };
}

export async function listGuestPlaceModels(
  userId: string,
  now: Date = new Date(),
  deps?: GuestModelDependencies
): Promise<GuestPlaceModel[]> {
  const d = deps ?? (await loadDefaultDependencies());

  const eligiblePlaceIds = await d.listEligiblePlaceIds(userId, now);
  if (eligiblePlaceIds.length === 0) return [];

  const [sources, visitedPlaceIds] = await Promise.all([
    d.listModelsForPlaces(eligiblePlaceIds),
    d.listVisitedPlaceIds(userId),
  ]);

  return buildGuestModels({
    sources,
    eligiblePlaceIds: new Set(eligiblePlaceIds),
    visitedPlaceIds: new Set(visitedPlaceIds),
  });
}
