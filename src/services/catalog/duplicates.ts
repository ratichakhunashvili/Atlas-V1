import { distanceMeters } from "@/lib/geo";

/**
 * Likely-duplicate detection for the canonical Place catalog. Pure: callers pass in the candidate pool.
 *
 * It only ever SUGGESTS. Atlas never merges, deletes or blocks on a match — an admin reviews the list and either
 * opens the existing Place or deliberately creates anyway (two real businesses can share a name, or a building).
 */

/** Places this close together are worth a second look even when the names differ. */
export const DUPLICATE_RADIUS_METERS = 150;

export type DuplicateCandidate = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  category: string;
  archived: boolean;
};

export type DuplicateMatch = {
  place: DuplicateCandidate;
  /** Why it was flagged, in words an admin can act on. */
  reasons: Array<"same_name" | "similar_name" | "nearby">;
  distanceMeters: number;
};

/** Case, accents, punctuation and a leading "the" must not hide an obvious duplicate. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the /, "");
}

/** Dice coefficient on character bigrams: 1 = identical, 0 = nothing shared. Robust to small typos and word order. */
export function nameSimilarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (x === "" || y === "") return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;

  const bigrams = (value: string) => {
    const counts = new Map<string, number>();
    for (let index = 0; index < value.length - 1; index += 1) {
      const pair = value.slice(index, index + 2);
      counts.set(pair, (counts.get(pair) ?? 0) + 1);
    }
    return counts;
  };

  const left = bigrams(x);
  const right = bigrams(y);
  let overlap = 0;
  for (const [pair, count] of left) overlap += Math.min(count, right.get(pair) ?? 0);
  return (2 * overlap) / (x.length - 1 + (y.length - 1));
}

const SIMILAR_NAME_THRESHOLD = 0.8;

export function findLikelyDuplicates(
  candidate: { name: string; latitude: number; longitude: number },
  existing: readonly DuplicateCandidate[]
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];

  for (const place of existing) {
    const metres = distanceMeters(
      { lat: candidate.latitude, lng: candidate.longitude },
      { lat: place.latitude, lng: place.longitude }
    );
    const similarity = nameSimilarity(candidate.name, place.name);
    const reasons: DuplicateMatch["reasons"] = [];

    if (similarity === 1) reasons.push("same_name");
    else if (similarity >= SIMILAR_NAME_THRESHOLD) reasons.push("similar_name");
    // Nearby alone is only suspicious when it is VERY close; otherwise a hotel and its restaurant would always collide.
    if (metres <= DUPLICATE_RADIUS_METERS && (similarity >= 0.5 || metres <= 25)) reasons.push("nearby");

    if (reasons.length > 0) matches.push({ place, reasons, distanceMeters: metres });
  }

  // Strongest signals first: an exact name beats a similar one beats mere proximity.
  const rank = (match: DuplicateMatch) =>
    match.reasons.includes("same_name") ? 0 : match.reasons.includes("similar_name") ? 1 : 2;
  return matches.sort((a, b) => rank(a) - rank(b) || a.distanceMeters - b.distanceMeters);
}
