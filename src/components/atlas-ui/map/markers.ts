import type { Map as MapboxMap } from "mapbox-gl/esm";

/*
 * Map marker images, registered with Mapbox as native images so markers render in a symbol
 * layer (one GeoJSON source) instead of one DOM element per place.
 *
 * Shapes follow the Figma map layer exactly (sizes in CSS pixels):
 *   partner     30 rounded square r9, Warm Beige, 2px Deep Teal border, 6px teal dot
 *   facility    30 circle, Warm White, 2px Deep Teal border, 6px teal dot
 *   selected    36 version of the same shape on a 42 Muted Bronze ring (r12 square / circle)
 *   checked     30 partner square in Deep Teal with a 3px Warm White border and a check
 *   attraction  32 diamond, exported from Figma (beige; bronze when selected)
 *   hotel       38 Deep Teal circle, 3px Warm White border, home icon
 *   you         26 halo at 18% teal around a 13 teal dot with a 3px Warm White border
 * Route screens add a plain start circle, a plain destination square and a small "you" dot.
 *
 * Shapes are drawn from those numbers; icons are drawn from the exported Figma files.
 */

const TEAL = "#0a4a4f";
const PAPER = "#f6f3ed";
const BEIGE = "#d7c4b1";
const BRONZE = "#a58d66";
const PIXEL_RATIO = 2;

type Overlay = { src: string; size: number };
type MarkerSpec = { size: number; svg?: string; overlay?: Overlay; src?: string };

const svg = (size: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`;

/** A CSS box with an inside border, as an SVG rect (the stroke is centred on the path). */
const box = (x: number, size: number, radius: number, fill: string, stroke: string, strokeWidth: number) => {
  const half = strokeWidth / 2;
  return `<rect x="${x + half}" y="${x + half}" width="${size - strokeWidth}" height="${size - strokeWidth}" rx="${radius - half}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
};

const dot = (center: number) => `<rect x="${center - 3}" y="${center - 3}" width="6" height="6" rx="3" fill="${TEAL}"/>`;

export const MARKERS = {
  "partner": { size: 30, svg: svg(30, box(0, 30, 9, BEIGE, TEAL, 2) + dot(15)) },
  "partner-selected": {
    size: 42,
    svg: svg(42, `<rect width="42" height="42" rx="12" fill="${BRONZE}"/>` + box(3, 36, 9, BEIGE, TEAL, 2) + dot(21)),
  },
  /** The plan's next stop on the next-stop map: the 36 size without the selection ring. */
  "partner-next": { size: 36, svg: svg(36, box(0, 36, 9, BEIGE, TEAL, 2) + dot(18)) },
  "partner-checked": {
    size: 30,
    svg: svg(30, box(0, 30, 9, TEAL, PAPER, 3)),
    overlay: { src: "/atlas-ui/icon-check-light-14.svg", size: 14 },
  },
  "facility": { size: 30, svg: svg(30, box(0, 30, 15, PAPER, TEAL, 2) + dot(15)) },
  "facility-selected": {
    size: 42,
    svg: svg(42, `<rect width="42" height="42" rx="21" fill="${BRONZE}"/>` + box(3, 36, 18, PAPER, TEAL, 2) + dot(21)),
  },
  "attraction": { size: 32, src: "/atlas-ui/marker-attraction.svg" },
  "attraction-selected": { size: 32, src: "/atlas-ui/marker-attraction-selected.svg" },
  "hotel": {
    size: 38,
    svg: svg(38, box(0, 38, 19, TEAL, PAPER, 3)),
    overlay: { src: "/atlas-ui/icon-home-light-17.svg", size: 17 },
  },
  "you": {
    size: 26,
    svg: svg(26, `<circle cx="13" cy="13" r="13" fill="${TEAL}" fill-opacity="0.18"/>` + box(6.5, 13, 6.5, TEAL, PAPER, 3)),
  },
  "route-start": { size: 32, svg: svg(32, box(0, 32, 16, TEAL, PAPER, 3)) },
  "route-destination": { size: 36, svg: svg(36, box(0, 36, 9, BEIGE, TEAL, 2)) },
  "route-you": { size: 14, svg: svg(14, box(0, 14, 7, TEAL, PAPER, 3)) },
} satisfies Record<string, MarkerSpec>;

export type MarkerImage = keyof typeof MARKERS;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load marker image ${src.slice(0, 60)}`));
    image.src = src;
  });
}

async function rasterize(spec: MarkerSpec): Promise<ImageData> {
  const px = spec.size * PIXEL_RATIO;
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas is not available");

  const base = spec.src ?? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(spec.svg ?? "")}`;
  context.drawImage(await loadImage(base), 0, 0, px, px);

  if (spec.overlay) {
    const icon = spec.overlay.size * PIXEL_RATIO;
    context.drawImage(await loadImage(spec.overlay.src), (px - icon) / 2, (px - icon) / 2, icon, icon);
  }
  return context.getImageData(0, 0, px, px);
}

export type MarkerBitmaps = Record<MarkerImage, ImageData>;

/**
 * Draws every marker image up front. Do this before the map is created: adding images to the
 * map asynchronously while its first tiles are being parsed leaves those tiles stuck loading
 * (seen with mapbox-gl 3.33), so registration must happen synchronously in `style.load`.
 */
export async function rasterizeMarkers(): Promise<MarkerBitmaps> {
  const entries = await Promise.all(
    (Object.entries(MARKERS) as [MarkerImage, MarkerSpec][]).map(async ([name, spec]) => [name, await rasterize(spec)] as const)
  );
  return Object.fromEntries(entries) as MarkerBitmaps;
}

/**
 * Map image id for a marker. Prefixed because Mapbox styles ship their own images with common
 * names — light-v11 already has an "attraction" icon, which would otherwise be used instead.
 */
export const markerImageId = (name: string) => `atlas-${name}`;

/** Registers the pre-drawn marker images. Synchronous; safe to call again after a style reload. */
export function registerMarkers(map: MapboxMap, bitmaps: MarkerBitmaps): void {
  for (const [name, data] of Object.entries(bitmaps)) {
    const id = markerImageId(name);
    if (!map.hasImage(id)) map.addImage(id, data, { pixelRatio: PIXEL_RATIO });
  }
}
