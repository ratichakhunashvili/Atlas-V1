import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AR_MATCH_THRESHOLD,
  HASH_BITS,
  HASH_GRID,
  HASH_HEX_LENGTH,
  compareHashes,
  hammingDistance,
  hashFromGreyscale,
  isValidHash,
  hasSufficientDetail,
  setBitCount,
  MIN_TARGET_DETAIL,
} from "./hash";

/**
 * The hash and the comparison, checked by arithmetic.
 *
 * None of this makes AR a strong proof of presence — it matches a framing, and it
 * is paired with GPS proximity for exactly that reason. What these tests protect
 * is the boundary: malformed input must never read as a match, and the threshold
 * must sit where it was approved.
 */

/** A grid built from a function of row and column, for predictable gradients. */
function grid(fill: (row: number, col: number) => number): number[] {
  const values: number[] = [];
  for (let row = 0; row < HASH_GRID; row += 1) {
    for (let col = 0; col < HASH_GRID; col += 1) {
      values.push(fill(row, col));
    }
  }
  return values;
}

/** Flips `count` bits of a hash, to simulate a slightly different photo. */
function perturb(hash: string, count: number): string {
  const nibbles = hash.split("").map((char) => Number.parseInt(char, 16));
  let remaining = count;

  for (let index = 0; index < nibbles.length && remaining > 0; index += 1) {
    // Flip one bit per nibble, so the count is exact.
    nibbles[index] ^= 0b0001;
    remaining -= 1;
  }

  return nibbles.map((value) => value.toString(16)).join("");
}

describe("the hash's shape", () => {
  it("is 240 bits, as approved", () => {
    assert.equal(HASH_BITS, 240);
    assert.equal(HASH_GRID, 16);
  });

  it("produces exactly 60 hex characters", () => {
    const hash = hashFromGreyscale(grid((_, col) => col * 16));

    assert.equal(hash.length, HASH_HEX_LENGTH);
    assert.equal(hash.length, 60);
    assert.match(hash, /^[0-9a-f]+$/);
  });

  it("refuses a grid of the wrong size rather than hashing nonsense", () => {
    assert.throws(() => hashFromGreyscale([1, 2, 3]));
    assert.throws(() => hashFromGreyscale([]));
  });

  it("is deterministic: the same image always hashes the same", () => {
    const values = grid((row, col) => (row * col) % 255);
    assert.equal(hashFromGreyscale(values), hashFromGreyscale(values));
  });

  it("keys on gradients, so a uniform brightness shift does not change it", () => {
    // The whole image 40 units brighter: every left-right comparison is unchanged.
    const original = grid((row, col) => (row * 7 + col * 11) % 200);
    const brighter = original.map((value) => value + 40);

    assert.equal(
      hashFromGreyscale(original),
      hashFromGreyscale(brighter),
      "a cloud passing must not break a guest's check-in"
    );
  });

  it("gives different hashes to different images", () => {
    const leftBright = hashFromGreyscale(grid((_, col) => 255 - col * 16));
    const rightBright = hashFromGreyscale(grid((_, col) => col * 16));

    assert.notEqual(leftBright, rightBright);
  });

  it("hashes a flat image to all zeros — no pixel is brighter than its neighbour", () => {
    const flat = hashFromGreyscale(grid(() => 128));
    assert.equal(flat, "0".repeat(HASH_HEX_LENGTH));
  });
});

describe("validating a hash", () => {
  const valid = hashFromGreyscale(grid((_, col) => col * 16));

  it("accepts what this module produces", () => {
    assert.equal(isValidHash(valid), true);
  });

  it("refuses the wrong length, wrong alphabet, and wrong type", () => {
    for (const bad of [
      valid.slice(0, 59),
      `${valid}0`,
      `${valid.slice(0, 59)}X`,
      // An explicit uppercase hash: the sample above may happen to be all digits,
      // in which case toUpperCase() would be a no-op and prove nothing.
      "A".repeat(HASH_HEX_LENGTH),
      "",
      null,
      undefined,
      42,
      {},
    ]) {
      assert.equal(isValidHash(bad), false, `${String(bad)} must be refused`);
    }
  });
});

describe("Hamming distance", () => {
  const base = hashFromGreyscale(grid((row, col) => (row * 13 + col * 7) % 255));

  it("is zero for identical hashes", () => {
    assert.equal(hammingDistance(base, base), 0);
  });

  it("counts flipped bits exactly", () => {
    assert.equal(hammingDistance(base, perturb(base, 1)), 1);
    assert.equal(hammingDistance(base, perturb(base, 10)), 10);
  });

  it("is symmetric", () => {
    const other = perturb(base, 17);
    assert.equal(hammingDistance(base, other), hammingDistance(other, base));
  });

  it("returns NULL for malformed input, never a number", () => {
    // A number would be compared against the threshold, and 0 would be a match.
    assert.equal(hammingDistance(base, "nonsense"), null);
    assert.equal(hammingDistance("", base), null);
    assert.equal(hammingDistance("A".repeat(HASH_HEX_LENGTH), base), null, "uppercase hex is not what this module emits");
  });
});

describe("comparing against the stored target", () => {
  const target = hashFromGreyscale(grid((row, col) => (row * 13 + col * 7) % 255));

  /** 0.22 of 240 bits = 52.8, so 52 bits is the last passing distance. */
  const atThreshold = Math.floor(AR_MATCH_THRESHOLD * HASH_BITS);

  it("uses the approved threshold", () => {
    assert.equal(AR_MATCH_THRESHOLD, 0.22);
  });

  it("matches an identical capture", () => {
    const result = compareHashes(target, target);

    assert.equal(result.ok, true);
    assert.equal(result.ok === true && result.distance, 0);
  });

  it("matches a capture just inside the threshold", () => {
    const result = compareHashes(perturb(target, atThreshold), target);

    assert.equal(result.ok, true, `${atThreshold} differing bits should still match`);
    assert.ok(result.ok === true && result.ratio <= AR_MATCH_THRESHOLD);
  });

  it("refuses a capture past the threshold", () => {
    const tooFar = Math.ceil(AR_MATCH_THRESHOLD * HASH_BITS) + 1;
    const result = compareHashes(perturb(target, tooFar), target);

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "too_different");
  });

  it("refuses a completely unrelated image", () => {
    const unrelated = hashFromGreyscale(grid((_, col) => 255 - col * 16));
    const result = compareHashes(unrelated, target);

    assert.equal(result.ok, false);
  });

  it("refuses malformed input rather than treating it as a perfect match", () => {
    for (const bad of ["", "zzz", target.slice(0, 10)]) {
      const result = compareHashes(bad, target);
      assert.equal(result.ok, false, `${bad} must not pass`);
      assert.equal(result.ok === false && result.reason, "malformed");
    }
  });

  it("refuses when the TARGET is malformed too", () => {
    const result = compareHashes(target, "not-a-hash");
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "malformed");
  });

  it("honours a stricter threshold when one is given", () => {
    const slightlyOff = perturb(target, 10);

    assert.equal(compareHashes(slightlyOff, target).ok, true);
    assert.equal(compareHashes(slightlyOff, target, 0.01).ok, false);
  });
});

describe("a reference image must actually be distinctive", () => {
  it("counts set bits, and reports null rather than a number for malformed input", () => {
    assert.equal(setBitCount("0".repeat(HASH_HEX_LENGTH)), 0);
    assert.equal(setBitCount("f".repeat(HASH_HEX_LENGTH)), HASH_BITS);
    assert.equal(setBitCount("nonsense"), null);
  });

  it("refuses a featureless reference, because a covered lens would match it", () => {
    // The arithmetic that makes this a security bound rather than a preference:
    // an all-zero capture's distance from a target IS the target's set-bit count.
    const blankWall = "0".repeat(HASH_HEX_LENGTH);
    assert.equal(hasSufficientDetail(blankWall).ok, false);

    const coveredLens = "0".repeat(HASH_HEX_LENGTH);
    const comparison = compareHashes(coveredLens, blankWall);
    assert.equal(comparison.ok, true, "which is exactly why such a target must never be storable");
  });

  it("sets the floor above the match threshold, with margin", () => {
    assert.ok(
      MIN_TARGET_DETAIL > AR_MATCH_THRESHOLD,
      "below the threshold, a degenerate capture would match a permitted target"
    );
  });

  it("refuses a target a blank capture could reach, and accepts one it could not", () => {
    const blank = "0".repeat(HASH_HEX_LENGTH);

    // 52 set bits is just under the 30% floor; a blank frame is within the
    // approved 52-bit match distance, so this target must be rejected.
    const tooPlain = `${"f".repeat(13)}${"0".repeat(HASH_HEX_LENGTH - 13)}`;
    assert.equal(setBitCount(tooPlain), 52);
    assert.equal(hasSufficientDetail(tooPlain).ok, false);

    // 72 set bits is exactly 30% of the 240-bit hash and is accepted.
    const atMinimum = `${"f".repeat(18)}${"0".repeat(HASH_HEX_LENGTH - 18)}`;
    assert.equal(setBitCount(atMinimum), 72);
    assert.equal(hasSufficientDetail(atMinimum).ok, true);

    // A detailed reference: a blank frame is nowhere near it.
    const detailed = "5".repeat(HASH_HEX_LENGTH);
    assert.equal(hasSufficientDetail(detailed).ok, true);
    assert.equal(compareHashes(blank, detailed).ok, false, "a covered lens must not match a real target");
    assert.equal(compareHashes("f".repeat(HASH_HEX_LENGTH), detailed).ok, false, "nor must a white-out");
  });

  it("refuses an all-white reference as well as an all-black one", () => {
    assert.equal(hasSufficientDetail("f".repeat(HASH_HEX_LENGTH)).ok, false);
    assert.equal(hasSufficientDetail("malformed").ok, false);
  });
});
