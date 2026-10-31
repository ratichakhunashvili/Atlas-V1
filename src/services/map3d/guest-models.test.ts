import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlaceModel } from "@/db/schema";
import { buildGuestModels, listGuestPlaceModels, type ModelSource } from "./index";

/**
 * Who may see which model, and whose visit unlocks it.
 *
 * The lock rule is the one that matters most here: a model is unlocked by the
 * authenticated guest's OWN permanent verified visit, and by nothing else. These
 * tests exist so that can never quietly become "anyone's visit", "a completed
 * stop", or "whatever the client said".
 */

const NOW = new Date("2026-03-10T12:00:00Z");

const PLACE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PLACE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function model(overrides: Partial<PlaceModel> = {}): PlaceModel {
  return {
    id: "model-1",
    placeId: PLACE_A,
    storageKey: "place-models/secret-key.glb",
    fileUrl: "https://cdn.example.com/model.glb",
    fileSizeBytes: 1024,
    contentType: "model/gltf-binary",
    status: "enabled",
    targetHeightMeters: 20,
    rotationDegrees: 45,
    elevationOffsetMeters: 0,
    scale: 1,
    anchorLatitude: null,
    anchorLongitude: null,
    pitchDegrees: 0,
    rollDegrees: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    uploadedByUserId: "admin-1",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function source(overrides: Partial<PlaceModel> = {}, place = { id: PLACE_A, latitude: 41.7, longitude: 44.8 }): ModelSource {
  return { model: model({ ...overrides, placeId: place.id }), place };
}

describe("lock state follows the guest's own verified visit", () => {
  it("unlocks a model the guest has visited", () => {
    const [result] = buildGuestModels({
      sources: [source()],
      eligiblePlaceIds: new Set([PLACE_A]),
      visitedPlaceIds: new Set([PLACE_A]),
    });

    assert.equal(result.unlocked, true);
  });

  it("leaves a model locked when the guest has not been there", () => {
    const [result] = buildGuestModels({
      sources: [source()],
      eligiblePlaceIds: new Set([PLACE_A]),
      visitedPlaceIds: new Set(),
    });

    assert.equal(result.unlocked, false);
  });

  it("one guest's visit cannot unlock a model for another guest", async () => {
    const visitor = "user-visited";
    const stranger = "user-never-been";

    const deps = {
      listEligiblePlaceIds: async () => [PLACE_A],
      listModelsForPlaces: async () => [source()],
      // Only the visitor has a permanent visit; the stranger has none.
      listVisitedPlaceIds: async (userId: string) => (userId === visitor ? [PLACE_A] : []),
    };

    const forVisitor = await listGuestPlaceModels(visitor, NOW, deps);
    const forStranger = await listGuestPlaceModels(stranger, NOW, deps);

    assert.equal(forVisitor[0].unlocked, true);
    assert.equal(forStranger[0].unlocked, false, "lock state is per guest, never global");
  });

  it("sends the same shape locked or unlocked, so the difference cannot be inferred", () => {
    const [locked] = buildGuestModels({
      sources: [source()],
      eligiblePlaceIds: new Set([PLACE_A]),
      visitedPlaceIds: new Set(),
    });
    const [unlocked] = buildGuestModels({
      sources: [source()],
      eligiblePlaceIds: new Set([PLACE_A]),
      visitedPlaceIds: new Set([PLACE_A]),
    });

    assert.deepEqual(Object.keys(locked).sort(), Object.keys(unlocked).sort());
  });
});

describe("eligibility still governs what is sent at all", () => {
  it("omits a model for a Place this hotel has not approved", () => {
    const results = buildGuestModels({
      sources: [source({}, { id: PLACE_B, latitude: 41.9, longitude: 45.1 })],
      eligiblePlaceIds: new Set([PLACE_A]),
      visitedPlaceIds: new Set([PLACE_B]),
    });

    assert.deepEqual(results, [], "a visit does not make an ineligible Place visible");
  });

  it("sends nothing at all to a guest with no eligible Places", async () => {
    const results = await listGuestPlaceModels("user-1", NOW, {
      listEligiblePlaceIds: async () => [],
      listModelsForPlaces: async () => {
        throw new Error("must not be queried when nothing is eligible");
      },
      listVisitedPlaceIds: async () => [PLACE_A],
    });

    assert.deepEqual(results, []);
  });

  it("omits a draft model, however eligible the Place", () => {
    const results = buildGuestModels({
      sources: [source({ status: "draft" })],
      eligiblePlaceIds: new Set([PLACE_A]),
      visitedPlaceIds: new Set([PLACE_A]),
    });

    assert.deepEqual(results, [], "a half-placed model never reaches a guest's map");
  });
});

describe("privileged fields never cross to the browser", () => {
  it("drops the storage key and the uploader", () => {
    const [result] = buildGuestModels({
      sources: [source()],
      eligiblePlaceIds: new Set([PLACE_A]),
      visitedPlaceIds: new Set([PLACE_A]),
    });

    const serialised = JSON.stringify(result);

    assert.equal("storageKey" in result, false, "the storage key is how a file is overwritten or deleted");
    assert.equal("uploadedByUserId" in result, false);
    assert.equal(serialised.includes("secret-key"), false);
    assert.equal(serialised.includes("admin-1"), false);
  });

  it("sends the placement settings the renderer actually needs", () => {
    const [result] = buildGuestModels({
      sources: [source({ targetHeightMeters: 30, rotationDegrees: 90, elevationOffsetMeters: 5, scale: 2 })],
      eligiblePlaceIds: new Set([PLACE_A]),
      visitedPlaceIds: new Set(),
    });

    assert.equal(result.targetHeightMeters, 30);
    assert.equal(result.rotationDegrees, 90);
    assert.equal(result.elevationOffsetMeters, 5);
    assert.equal(result.scale, 2);
    assert.equal(result.latitude, 41.7);
    assert.equal(result.longitude, 44.8);
  });
});

describe("a model's display anchor never becomes the Place's location", () => {
  const place = { id: PLACE_A, latitude: 41.7, longitude: 44.8 };

  it("keeps the canonical coordinates on the payload and reports the anchor separately", () => {
    const [guestModel] = buildGuestModels({
      sources: [source({ anchorLatitude: 41.703, anchorLongitude: 44.803 }, place)],
      eligiblePlaceIds: new Set([PLACE_A]),
      visitedPlaceIds: new Set(),
    });

    assert.equal(guestModel.latitude, 41.7, "the pin, navigation and check-in use the Place");
    assert.equal(guestModel.longitude, 44.8);
    assert.equal(guestModel.anchorLatitude, 41.703);
    assert.equal(guestModel.anchorLongitude, 44.803);
    assert.ok(guestModel.displacementMeters > 300, "the guest can be told how far the drawn model is from the real place");
  });

  it("draws an un-anchored model at the Place, with no displacement", () => {
    const [guestModel] = buildGuestModels({
      sources: [source({}, place)],
      eligiblePlaceIds: new Set([PLACE_A]),
      visitedPlaceIds: new Set(),
    });
    assert.deepEqual([guestModel.anchorLatitude, guestModel.anchorLongitude, guestModel.displacementMeters], [41.7, 44.8, 0]);
  });

  it("still requires eligibility for the LINKED Place, however far the model is displaced", () => {
    // The model is anchored right next to an eligible Place, but it belongs to a Place this hotel has not approved.
    const result = buildGuestModels({
      sources: [source({ anchorLatitude: 41.7001, anchorLongitude: 44.8001 }, place)],
      eligiblePlaceIds: new Set(["some-other-place"]),
      visitedPlaceIds: new Set([PLACE_A]),
    });
    assert.deepEqual(result, [], "proximity to an eligible Place grants nothing; eligibility follows the linked Place");
  });

  it("carries the full transform without leaking privileged fields", () => {
    const [guestModel] = buildGuestModels({
      sources: [source({ pitchDegrees: 10, rollDegrees: -5, scaleX: 2, scaleY: 1, scaleZ: 3 }, place)],
      eligiblePlaceIds: new Set([PLACE_A]),
      visitedPlaceIds: new Set(),
    });
    assert.equal(guestModel.pitchDegrees, 10);
    assert.equal(guestModel.rollDegrees, -5);
    assert.deepEqual([guestModel.scaleX, guestModel.scaleY, guestModel.scaleZ], [2, 1, 3]);
    const serialised = JSON.stringify(guestModel);
    assert.equal(serialised.includes("secret-key"), false);
    assert.equal(serialised.includes("storageKey"), false);
  });
});
