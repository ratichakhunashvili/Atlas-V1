import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HASH_GRID, hashFromGreyscale } from "./hash";
import { DOWNSCALE_SIZE, centredSquare, greyscaleGrid, luminance } from "./greyscale";

/**
 * The reduction step, checked by arithmetic.
 *
 * This matters more than it looks: the admin's browser and the guest's browser
 * both run this code, and if it ever became resolution-dependent, a reference
 * taken on one device would stop matching captures from another — which reads to
 * a guest as "the app does not work", not as a bug in a downscaler.
 */

/** Builds an RGBA buffer from a function of x and y. */
function rgba(width: number, height: number, fill: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = fill(x, y);
      const offset = (y * width + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 255;
    }
  }
  return data;
}

describe("brightness", () => {
  it("weights green most, as human vision does", () => {
    const green = luminance(0, 255, 0);
    const red = luminance(255, 0, 0);
    const blue = luminance(0, 0, 255);

    assert.ok(green > red && red > blue);
  });

  it("maps black and white to the ends of the range", () => {
    assert.equal(luminance(0, 0, 0), 0);
    assert.equal(Math.round(luminance(255, 255, 255)), 255);
  });
});

describe("reducing an image to the grid", () => {
  it("always returns exactly one value per cell", () => {
    for (const [width, height] of [[16, 16], [64, 64], [1920, 1080], [17, 31], [3, 5]]) {
      const grid = greyscaleGrid(rgba(width, height, () => [10, 20, 30]), width, height);
      assert.equal(grid.length, HASH_GRID * HASH_GRID, `${width}x${height}`);
    }
  });

  it("refuses a buffer that does not match the stated dimensions", () => {
    assert.throws(() => greyscaleGrid(new Uint8ClampedArray(10), 16, 16));
    assert.throws(() => greyscaleGrid(rgba(4, 4, () => [0, 0, 0]), 0, 4));
    assert.throws(() => greyscaleGrid(rgba(4, 4, () => [0, 0, 0]), 4.5, 4));
  });

  it("averages a cell rather than sampling one pixel of it", () => {
    // A 32x32 image where every cell is half black and half white: sampling would
    // give 0 or 255 depending which pixel it hit; averaging gives the midpoint.
    const data = rgba(32, 32, (x) => (x % 2 === 0 ? [0, 0, 0] : [255, 255, 255]));
    const grid = greyscaleGrid(data, 32, 32);

    for (const value of grid) assert.ok(Math.abs(value - 127.5) < 1, `expected a mid grey, got ${value}`);
  });

  it("gives the same hash for the same scene at two resolutions", () => {
    // The property the whole feature rests on: a reference taken from a large
    // image must match a capture from a smaller camera frame.
    const scene = (size: number) => (x: number, y: number): [number, number, number] => {
      const value = Math.floor(((x / size) * 200 + (y / size) * 55) % 256);
      return [value, value, value];
    };

    const small = hashFromGreyscale(greyscaleGrid(rgba(64, 64, scene(64)), 64, 64));
    const large = hashFromGreyscale(greyscaleGrid(rgba(512, 512, scene(512)), 512, 512));

    assert.equal(small, large);
  });

  it("is unchanged by a uniform brightness shift", () => {
    const base = (x: number, y: number): [number, number, number] => {
      const value = (x * 3 + y * 5) % 180;
      return [value, value, value];
    };
    const brighter = (x: number, y: number): [number, number, number] => {
      const [value] = base(x, y);
      return [value + 50, value + 50, value + 50];
    };

    assert.equal(
      hashFromGreyscale(greyscaleGrid(rgba(64, 64, base), 64, 64)),
      hashFromGreyscale(greyscaleGrid(rgba(64, 64, brighter), 64, 64))
    );
  });

  it("distinguishes genuinely different scenes", () => {
    const leftDark = hashFromGreyscale(greyscaleGrid(rgba(64, 64, (x) => [x * 4, x * 4, x * 4]), 64, 64));
    const rightDark = hashFromGreyscale(
      greyscaleGrid(rgba(64, 64, (x) => [255 - x * 4, 255 - x * 4, 255 - x * 4]), 64, 64)
    );

    assert.notEqual(leftDark, rightDark);
  });
});

describe("the square region that gets hashed", () => {
  it("is the whole frame when it is already square", () => {
    assert.deepEqual(centredSquare(500, 500), { x: 0, y: 0, size: 500 });
  });

  it("centres on the short side for a portrait phone frame", () => {
    assert.deepEqual(centredSquare(1080, 1920), { x: 0, y: 420, size: 1080 });
  });

  it("centres on the short side for a landscape webcam frame", () => {
    assert.deepEqual(centredSquare(1280, 720), { x: 280, y: 0, size: 720 });
  });

  it("never runs off the edge of the frame", () => {
    for (const [width, height] of [[3, 7], [1001, 999], [16, 9]]) {
      const square = centredSquare(width, height);
      assert.ok(square.x >= 0 && square.y >= 0);
      assert.ok(square.x + square.size <= width);
      assert.ok(square.y + square.size <= height);
    }
  });
});

describe("the intermediate buffer the capture path actually uses", () => {
  it("divides evenly into the hash grid, so every cell averages the same number of pixels", () => {
    // 128 / 16 = 8. An uneven ratio would make some cells average more pixels
    // than others and weight parts of the image arbitrarily.
    assert.equal(DOWNSCALE_SIZE % HASH_GRID, 0);
    assert.ok(DOWNSCALE_SIZE > HASH_GRID, "there must be something left to average");
  });

  it("averages 8x8 blocks rather than sampling, at exactly that size", () => {
    // Alternating columns: sampling one pixel per cell would give 0 or 255;
    // averaging gives the midpoint. This is the size production runs at.
    const data = rgba(DOWNSCALE_SIZE, DOWNSCALE_SIZE, (x) => (x % 2 === 0 ? [0, 0, 0] : [255, 255, 255]));
    const grid = greyscaleGrid(data, DOWNSCALE_SIZE, DOWNSCALE_SIZE);

    for (const value of grid) assert.ok(Math.abs(value - 127.5) < 1, `expected a mid grey, got ${value}`);
  });

  it("survives single-pixel noise at that size, which a 16x16 draw would not", () => {
    const scene = (x: number, y: number): [number, number, number] => {
      const value = (x * 2 + y * 3) % 256;
      return [value, value, value];
    };

    const clean = rgba(DOWNSCALE_SIZE, DOWNSCALE_SIZE, scene);
    const noisy = rgba(DOWNSCALE_SIZE, DOWNSCALE_SIZE, scene);
    // One blown-out pixel, as a dust speck or a sensor artefact would be.
    const offset = (40 * DOWNSCALE_SIZE + 40) * 4;
    noisy[offset] = 255;
    noisy[offset + 1] = 255;
    noisy[offset + 2] = 255;

    assert.equal(
      hashFromGreyscale(greyscaleGrid(clean, DOWNSCALE_SIZE, DOWNSCALE_SIZE)),
      hashFromGreyscale(greyscaleGrid(noisy, DOWNSCALE_SIZE, DOWNSCALE_SIZE)),
      "one stray pixel in 64 must not flip a bit"
    );
  });
});
