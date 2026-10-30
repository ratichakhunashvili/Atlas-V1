/**
 * Perceptual image hashing for the AR check-in provider.
 *
 * **What this is.** The admin's reference photo is reduced to a 16×16 greyscale
 * grid and turned into a 240-bit "difference hash" — each bit answers "is this
 * pixel brighter than the one to its right?". The guest's camera frame is reduced
 * and hashed the same way, and the server compares the two by Hamming distance.
 *
 * **Why dHash rather than an average hash.** It keys on local gradients, which
 * survive the brightness and exposure differences between a phone photo of a
 * landmark and the reference image of it. An average hash keys on absolute
 * lightness and falls over the moment a cloud passes.
 *
 * **What this is NOT, and must never be described as.** It matches a FRAMING of a
 * subject. It is tolerant of brightness and mild scale changes; it is not tolerant
 * of large viewpoint rotation, it does not track anything in 3D, and it does not
 * recognise objects from arbitrary angles. It is a verification signal — strong
 * enough to say "you are looking at this landmark", and deliberately paired with
 * the same GPS proximity every other check-in method gets, because a photo of a
 * photo would otherwise pass.
 *
 * Both the browser and the server use this module, so the two can never disagree
 * about how a hash is computed.
 */

/** The grid an image is reduced to before hashing. */
export const HASH_GRID = 16;

/** 16 rows × 15 horizontal comparisons = 240 bits. */
export const HASH_BITS = HASH_GRID * (HASH_GRID - 1);

/** Hex characters needed for 240 bits, at 4 bits each. */
export const HASH_HEX_LENGTH = HASH_BITS / 4;

/**
 * The fraction of differing bits still counted as the same subject.
 *
 * 0.22 of 240 bits is 52 bits: generous enough for a different phone, a different
 * time of day and a slightly different position, tight enough that an unrelated
 * photo does not pass. Lowering it rejects honest guests; raising it starts
 * accepting any photo with a similar layout.
 */
export const AR_MATCH_THRESHOLD = 0.22;

/**
 * Builds the hash from a greyscale grid of exactly HASH_GRID × HASH_GRID values.
 *
 * Returned as hex so it stores and transports as a short plain string.
 */
export function hashFromGreyscale(grey: readonly number[]): string {
  if (grey.length !== HASH_GRID * HASH_GRID) {
    throw new Error(`Expected ${HASH_GRID * HASH_GRID} greyscale samples, received ${grey.length}`);
  }

  const bits: number[] = [];
  for (let row = 0; row < HASH_GRID; row += 1) {
    for (let col = 0; col < HASH_GRID - 1; col += 1) {
      const left = grey[row * HASH_GRID + col];
      const right = grey[row * HASH_GRID + col + 1];
      bits.push(left > right ? 1 : 0);
    }
  }

  let hex = "";
  for (let index = 0; index < bits.length; index += 4) {
    const nibble =
      ((bits[index] ?? 0) << 3) |
      ((bits[index + 1] ?? 0) << 2) |
      ((bits[index + 2] ?? 0) << 1) |
      (bits[index + 3] ?? 0);
    hex += nibble.toString(16);
  }

  return hex;
}

/** Whether a string is a hash this module could have produced. Checked before anything is compared. */
export function isValidHash(value: unknown): value is string {
  return typeof value === "string" && value.length === HASH_HEX_LENGTH && /^[0-9a-f]+$/.test(value);
}

const BITS_IN_NIBBLE = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/**
 * How many bits differ between two hashes.
 *
 * Returns null for anything malformed rather than a number, so a caller cannot
 * accidentally treat "could not compare" as "distance zero" — which would be a
 * match.
 */
export function hammingDistance(a: string, b: string): number | null {
  if (!isValidHash(a) || !isValidHash(b)) return null;

  let distance = 0;
  for (let index = 0; index < a.length; index += 1) {
    const left = Number.parseInt(a[index], 16);
    const right = Number.parseInt(b[index], 16);
    distance += BITS_IN_NIBBLE[left ^ right];
  }

  return distance;
}

export type HashComparison =
  | { ok: true; distance: number; ratio: number }
  | { ok: false; reason: "malformed" | "too_different"; distance: number | null };

/**
 * Compares a submitted hash with the stored target.
 *
 * The threshold is inclusive: a ratio of exactly 0.22 matches. Malformed input is
 * a refusal, never a pass.
 */
export function compareHashes(
  submitted: string,
  target: string,
  threshold: number = AR_MATCH_THRESHOLD
): HashComparison {
  const distance = hammingDistance(submitted, target);
  if (distance === null) return { ok: false, reason: "malformed", distance: null };

  const ratio = distance / HASH_BITS;
  if (ratio > threshold) return { ok: false, reason: "too_different", distance };

  return { ok: true, distance, ratio };
}

/**
 * How many of a hash's 240 bits are set.
 *
 * A hash is "is this pixel brighter than its neighbour?" repeated, so this is a
 * measure of how much structure the image has. A photograph of open sky, a blank
 * wall or an out-of-focus blur produces very few set bits; a building with edges,
 * windows and sky behind it produces roughly half.
 */
export function setBitCount(hash: string): number | null {
  if (!isValidHash(hash)) return null;

  let count = 0;
  for (let index = 0; index < hash.length; index += 1) {
    count += BITS_IN_NIBBLE[Number.parseInt(hash[index], 16)];
  }
  return count;
}

/**
 * The band a REFERENCE hash must fall in to be usable, as a fraction of 240 bits.
 *
 * This is a security bound, not a quality preference, and the number is derived
 * rather than chosen. A capture of a covered lens or a white-out is all zeros or
 * all ones; its distance from a target is exactly the target's set-bit count (or
 * its complement). If a target had fewer than AR_MATCH_THRESHOLD × 240 set bits,
 * a guest could complete the stop with their thumb over the camera.
 *
 * 0.30 sits comfortably above the 0.22 threshold, so a degenerate capture is
 * refused with margin, and the upper bound is its mirror image.
 */
export const MIN_TARGET_DETAIL = 0.3;
export const MAX_TARGET_DETAIL = 1 - MIN_TARGET_DETAIL;

export type TargetDetailResult =
  | { ok: true; ratio: number }
  | { ok: false; reason: "malformed" | "too_plain" };

/**
 * Whether an image is distinctive enough to be used as a reference at all.
 *
 * Checked when an admin SAVES a target rather than when a guest captures one: a
 * target that fails here can never be stored, so no guest ever meets one.
 */
export function hasSufficientDetail(hash: string): TargetDetailResult {
  const bits = setBitCount(hash);
  if (bits === null) return { ok: false, reason: "malformed" };

  const ratio = bits / HASH_BITS;
  if (ratio < MIN_TARGET_DETAIL || ratio > MAX_TARGET_DETAIL) {
    return { ok: false, reason: "too_plain" };
  }

  return { ok: true, ratio };
}
