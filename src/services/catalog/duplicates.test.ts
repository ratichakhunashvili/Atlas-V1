import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { findLikelyDuplicates, nameSimilarity, normalizeName, type DuplicateCandidate } from "./duplicates";

function place(id: string, name: string, offsetMeters = 0, archived = false): DuplicateCandidate {
  return {
    id,
    name,
    latitude: 41.7 + (offsetMeters / 6371000) * (180 / Math.PI),
    longitude: 44.8,
    category: "restaurant",
    archived,
  };
}

const CANDIDATE = { name: "Cafe Linville", latitude: 41.7, longitude: 44.8 };

describe("name normalisation and similarity", () => {
  test("ignores case, accents, punctuation, ampersands and a leading 'the'", () => {
    assert.equal(normalizeName("The Café  Linville!"), "cafe linville");
    assert.equal(normalizeName("Wine & Dine"), "wine and dine");
    assert.equal(nameSimilarity("CAFÉ LINVILLE", "cafe linville"), 1);
  });

  test("scores near-identical names high and unrelated names low", () => {
    assert.ok(nameSimilarity("Cafe Linville", "Cafe Linvile") > 0.8);
    assert.ok(nameSimilarity("Cafe Linville", "Old Town Museum") < 0.4);
    assert.equal(nameSimilarity("", "x"), 0);
  });
});

describe("likely duplicates", () => {
  test("flags an exact name at the same spot, with both reasons", () => {
    const [match] = findLikelyDuplicates(CANDIDATE, [place("a", "Cafe Linville", 5)]);
    assert.deepEqual(match.reasons, ["same_name", "nearby"]);
  });

  test("flags the same name far away (a chain or a re-entry), as a name match only", () => {
    const [match] = findLikelyDuplicates(CANDIDATE, [place("a", "Cafe Linville", 3000)]);
    assert.deepEqual(match.reasons, ["same_name"]);
  });

  test("flags a very close place even with a different name, but not one merely in the same street", () => {
    assert.equal(findLikelyDuplicates(CANDIDATE, [place("a", "Totally Different", 10)]).length, 1);
    assert.equal(findLikelyDuplicates(CANDIDATE, [place("a", "Totally Different", 120)]).length, 0, "a hotel and its restaurant must not collide");
  });

  test("returns nothing when nothing resembles the candidate", () => {
    assert.deepEqual(findLikelyDuplicates(CANDIDATE, [place("a", "Old Town Museum", 900)]), []);
  });

  test("includes archived Places (they can be reused) and orders strongest first", () => {
    const matches = findLikelyDuplicates(CANDIDATE, [
      place("near", "Different Name", 10),
      place("similar", "Cafe Linvile", 2000),
      place("same", "cafe linville", 4000, true),
    ]);
    assert.deepEqual(matches.map((m) => m.place.id), ["same", "similar", "near"]);
    assert.equal(matches[0].place.archived, true);
  });
});
