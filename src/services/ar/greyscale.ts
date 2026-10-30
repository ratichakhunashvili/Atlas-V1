import { HASH_GRID } from "./hash";

/**
 * Reducing an image to the 16×16 greyscale grid the hash is built from.
 *
 * Kept separate from any canvas, camera or DOM so it can be tested by arithmetic
 * in Node, and so the admin's browser and the guest's browser provably reduce
 * images the same way — if they disagreed, no honest capture would ever match.
 *
 * **This never retains the image.** It reads the pixel buffer it is given and
 * returns 256 numbers. The buffer belongs to the caller, which discards it.
 */

/**
 * The size of the intermediate buffer an image is drawn into before this module
 * averages it down to the 16×16 grid.
 *
 * Why not draw straight into 16×16 and skip a step: the browser's own `drawImage`
 * downscale is a filter, and at a ratio like 1080→16 it aliases badly — the
 * resulting cells depend on sampling artefacts rather than on the scene, which is
 * exactly the instability the box-average below exists to remove. Drawing into
 * 128×128 first keeps the browser's reduction to a gentle ratio and leaves the
 * 128→16 averaging to code that is tested.
 *
 * It is still nowhere near a photograph: 16,384 pixels, held for the duration of
 * one function call and never read out as an image.
 */
export const DOWNSCALE_SIZE = 128;

/**
 * Perceived brightness. The green coefficient dominates because human vision is
 * most sensitive to green; a plain (r+g+b)/3 would make a red door and a blue
 * door indistinguishable from a grey one and throw away real structure.
 */
export function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Box-averages an RGBA buffer down to HASH_GRID × HASH_GRID brightness values.
 *
 * Averaging every pixel in each cell rather than sampling one of them is what
 * makes the hash stable across camera resolutions and sensor noise: a single
 * sampled pixel would make a speck of dust or a JPEG artefact flip a bit.
 *
 * Throws on a buffer whose size does not match the stated dimensions — a silent
 * mis-read would produce a confident hash of nonsense.
 */
export function greyscaleGrid(rgba: ArrayLike<number>, width: number, height: number): number[] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("Image dimensions must be positive integers");
  }
  if (rgba.length !== width * height * 4) {
    throw new Error(`Expected ${width * height * 4} RGBA values, received ${rgba.length}`);
  }

  const grid: number[] = [];

  for (let row = 0; row < HASH_GRID; row += 1) {
    // Integer cell bounds that tile the image exactly, with no gaps and no
    // overlap, even when the dimensions do not divide by 16.
    const yStart = Math.floor((row * height) / HASH_GRID);
    const yEnd = Math.max(yStart + 1, Math.floor(((row + 1) * height) / HASH_GRID));

    for (let col = 0; col < HASH_GRID; col += 1) {
      const xStart = Math.floor((col * width) / HASH_GRID);
      const xEnd = Math.max(xStart + 1, Math.floor(((col + 1) * width) / HASH_GRID));

      let total = 0;
      let count = 0;
      for (let y = yStart; y < yEnd && y < height; y += 1) {
        for (let x = xStart; x < xEnd && x < width; x += 1) {
          const offset = (y * width + x) * 4;
          total += luminance(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
          count += 1;
        }
      }

      grid.push(count === 0 ? 0 : total / count);
    }
  }

  return grid;
}

/**
 * The square region of a frame that is actually hashed.
 *
 * A phone camera is tall and a laptop webcam is wide; hashing the whole frame
 * would mean the same subject produced different hashes on different devices.
 * Taking the largest centred square makes the hash depend on what the guest
 * aimed at rather than on the shape of their screen, and it matches the square
 * viewfinder the capture UI draws.
 */
export function centredSquare(width: number, height: number): { x: number; y: number; size: number } {
  const size = Math.min(width, height);
  return {
    x: Math.floor((width - size) / 2),
    y: Math.floor((height - size) / 2),
    size,
  };
}
