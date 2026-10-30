import type { ScreenKey } from "./screen-hrefs";

/*
 * The demo content of the Atlas Figma file, as typed fixtures. Every name, time and status here
 * is copied from the design. Nothing is real: there is no Hotel A, and none of these places
 * exist. When the interface is given behaviour, these objects are what the server should
 * return instead — eligibility decided on the server for the guest's own hotel.
 *
 * Ids are stable so screens stay comparable across changes.
 */

export type PlaceId = "partner-2" | "partner-1" | "pool" | "spa" | "partner-4" | "attraction-1";

/** External partner, the hotel's own facility, or an attraction unlocked with the camera. */
export type PlaceKind = "partner" | "facility" | "attraction";

export type Photo = { src: string; width: number; height: number };

export type Place = {
  id: PlaceId;
  name: string;
  kind: PlaceKind;
  /** Eyebrow on cards: "Partner · Culture", "At your hotel · Wellness". */
  eyebrow: string;
  /** "11 min walk · 60 min" or "In Hotel A · 60 min". */
  meta: string;
  price?: "Budget" | "Moderate";
  /** Photo on the map sheet card. Plan position and achievement status come from the demo state (demo/live.ts). */
  photo?: Photo;
  /** Photo on the list row — the design uses a different picture there. */
  listPhoto?: Photo;
  /** Detail screen the card and marker open. */
  detail: ScreenKey;
  /**
   * Where the marker sits in the Figma map layer (centre, in the 390 x 844 frame). The map
   * converts these to coordinates around Hotel A, so Mapbox shows the same arrangement.
   */
  designPoint: [number, number];
};

export const HOTEL = {
  name: "Hotel A",
  designPoint: [179, 331] as [number, number],
};

/** The guest's position in the Figma map layer ("You"). */
export const YOU_DESIGN_POINT: [number, number] = [211, 379];

export const PLACES: Record<PlaceId, Place> = {
  "partner-2": {
    id: "partner-2",
    name: "Partner Place 2",
    kind: "partner",
    eyebrow: "Partner · Culture",
    meta: "11 min walk · 60 min",
    price: "Budget",
    photo: { src: "/atlas-ui/photo-partner-2.jpg", width: 320, height: 480 },
    listPhoto: { src: "/atlas-ui/list-partner-2.jpg", width: 480, height: 320 },
    detail: "Detail",
    designPoint: [92, 236],
  },
  "partner-1": {
    id: "partner-1",
    name: "Partner Place 1",
    kind: "partner",
    eyebrow: "Partner · Food",
    meta: "6 min walk · 45 min",
    price: "Moderate",
    photo: { src: "/atlas-ui/photo-partner-1.jpg", width: 320, height: 480 },
    listPhoto: { src: "/atlas-ui/list-partner-1.jpg", width: 397, height: 480 },
    detail: "DetailP1",
    designPoint: [272, 374],
  },
  pool: {
    id: "pool",
    name: "Pool",
    kind: "facility",
    eyebrow: "At your hotel · Wellness",
    meta: "In Hotel A · 60 min",
    photo: { src: "/atlas-ui/photo-pool.jpg", width: 359, height: 479 },
    listPhoto: { src: "/atlas-ui/list-pool.jpg", width: 320, height: 480 },
    detail: "FacilityPool",
    designPoint: [230, 284],
  },
  spa: {
    id: "spa",
    name: "Spa",
    kind: "facility",
    eyebrow: "At your hotel · Wellness",
    meta: "In Hotel A · 90 min",
    photo: { src: "/atlas-ui/photo-spa.jpg", width: 360, height: 480 },
    listPhoto: { src: "/atlas-ui/list-spa.jpg", width: 480, height: 320 },
    detail: "FacilityDetail",
    designPoint: [130, 322],
  },
  "partner-4": {
    id: "partner-4",
    name: "Partner Place 4",
    kind: "partner",
    eyebrow: "Partner · Culture",
    meta: "14 min walk · 60 min",
    photo: { src: "/atlas-ui/choice-partner-4.jpg", width: 480, height: 320 },
    listPhoto: { src: "/atlas-ui/list-partner-4.jpg", width: 479, height: 378 },
    detail: "DetailP4",
    designPoint: [58, 442],
  },
  "attraction-1": {
    id: "attraction-1",
    name: "Attraction 1",
    kind: "attraction",
    eyebrow: "Attraction · History",
    meta: "20 min walk · 45 min",
    photo: { src: "/atlas-ui/choice-attraction-1.jpg", width: 480, height: 329 },
    listPhoto: { src: "/atlas-ui/choice-attraction-1.jpg", width: 480, height: 329 },
    detail: "AttractionDetail",
    designPoint: [284, 248],
  },
};

/** Card order on the map sheet with nothing selected, as in the design. */
export const PLACE_ORDER: readonly PlaceId[] = ["partner-2", "partner-1", "pool", "spa", "partner-4", "attraction-1"];

export type MapFilter = "All" | "Hotel" | "Partners" | "Attractions" | "To unlock";

export const FILTERS: readonly { filter: MapFilter; shape?: "circle" | "square" | "diamond" }[] = [
  { filter: "All" },
  { filter: "Hotel", shape: "circle" },
  { filter: "Partners", shape: "square" },
  { filter: "Attractions", shape: "diamond" },
  { filter: "To unlock" },
];

/** Which places each filter chip keeps, and which one it selects first (Map layer variants). */
export const FILTER_PLACES: Record<MapFilter, { places: PlaceId[]; firstSelected: PlaceId }> = {
  All: { places: [...PLACE_ORDER], firstSelected: "partner-2" },
  Hotel: { places: ["pool", "spa"], firstSelected: "pool" },
  Partners: { places: ["partner-2", "partner-1", "partner-4"], firstSelected: "partner-2" },
  Attractions: { places: ["attraction-1"], firstSelected: "attraction-1" },
  "To unlock": { places: ["partner-2", "partner-4", "attraction-1"], firstSelected: "partner-2" },
};

/** Selected place first, the rest in their filter order — how every Map layer variant orders cards. */
export function orderedCards(filter: MapFilter, selected: PlaceId): PlaceId[] {
  const places = FILTER_PLACES[filter].places;
  return places.includes(selected) ? [selected, ...places.filter((id) => id !== selected)] : places;
}

export type ListSort = "Closest first" | "Shortest visit";

/** List results (1:4283): the two sort orders. Filters keep this order and drop what they exclude. */
export const LIST_ORDER: Record<ListSort, PlaceId[]> = {
  "Closest first": ["pool", "spa", "partner-1", "partner-2", "partner-4", "attraction-1"],
  "Shortest visit": ["partner-1", "attraction-1", "partner-2", "pool", "partner-4", "spa"],
};

export type RouteId = "partner-2" | "partner-1" | "partner-4" | "attraction-1";

export type RouteFixture = {
  destination: PlaceId;
  minutes: string;
  summary: string;
  steps: { icon: "up" | "turn" | "pin"; text: string; distance: string; emphasis?: boolean }[];
  endTo: ScreenKey;
};

const steps = (name: string): RouteFixture["steps"] => [
  { icon: "up", text: "Continue on [Street name]", distance: "90 m", emphasis: true },
  { icon: "turn", text: "Turn right onto [Street name]", distance: "260 m" },
  { icon: "pin", text: `Arrive at ${name}`, distance: "30 m" },
];

/**
 * Route · Walking route (1:731) and its RouteP1, RouteP4 and RouteA1 variants. The action at the
 * bottom of the sheet follows the stop's status in the demo plan (map/route-screen.tsx).
 */
export const ROUTES: Record<RouteId, RouteFixture> = {
  "partner-2": {
    destination: "partner-2",
    minutes: "9 min",
    summary: "700 m left · arrive 16:58",
    steps: steps("Partner Place 2"),
    endTo: "MyPlan",
  },
  "partner-1": {
    destination: "partner-1",
    minutes: "5 min",
    summary: "380 m left · arrive 16:06",
    steps: steps("Partner Place 1"),
    endTo: "DetailP1",
  },
  "partner-4": {
    destination: "partner-4",
    minutes: "12 min",
    summary: "1 km left · arrive 17:12",
    steps: steps("Partner Place 4"),
    endTo: "DetailP4",
  },
  "attraction-1": {
    destination: "attraction-1",
    minutes: "18 min",
    summary: "1.4 km left · arrive 17:20",
    steps: steps("Attraction 1"),
    endTo: "AttractionDetail",
  },
};
