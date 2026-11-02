import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildGuestAchievementsView, type AvailableBadge, type EarnedBadge } from "./guest-view";

const earned = (id: string, place: string, iso: string): EarnedBadge => ({
  achievementId: id,
  name: `Badge ${id}`,
  placeName: place,
  unlockedAt: new Date(iso),
  method: "qr",
});
const available = (id: string, place: string): AvailableBadge => ({ achievementId: id, name: `Badge ${id}`, placeId: `p-${id}`, placeName: place });

describe("buildGuestAchievementsView", () => {
  it("shows a badge as unlocked, not also as still to discover", () => {
    const view = buildGuestAchievementsView({
      earned: [earned("a", "Cafe", "2026-03-10T10:00:00Z")],
      availableHere: [available("a", "Cafe"), available("b", "Spa")],
    });
    assert.deepEqual(view.unlocked.map((b) => b.achievementId), ["a"]);
    assert.deepEqual(view.locked.map((b) => b.achievementId), ["b"]);
    assert.equal(view.total, 2);
  });

  it("keeps badges earned at a previous hotel", () => {
    const view = buildGuestAchievementsView({ earned: [earned("old", "Old hotel bar", "2026-01-01T10:00:00Z")], availableHere: [available("b", "Spa")] });
    assert.deepEqual(view.unlocked.map((b) => b.achievementId), ["old"]);
    assert.equal(view.total, 2);
  });

  it("lists the newest unlock first", () => {
    const view = buildGuestAchievementsView({
      earned: [earned("a", "A", "2026-03-10T10:00:00Z"), earned("b", "B", "2026-03-11T10:00:00Z")],
      availableHere: [],
    });
    assert.deepEqual(view.unlocked.map((b) => b.achievementId), ["b", "a"]);
  });

  it("shows nothing to discover when the hotel has no badges", () => {
    const view = buildGuestAchievementsView({ earned: [], availableHere: [] });
    assert.deepEqual(view, { unlocked: [], locked: [], total: 0 });
  });
});
