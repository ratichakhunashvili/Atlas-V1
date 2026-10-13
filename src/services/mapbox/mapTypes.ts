import type { PlaceCategory } from "@/db/schema";

// Engine-internal coordinate shape — {lng, lat}, matching Mapbox's own
// convention, so every layer/service file below can pass coordinates straight
// into Mapbox GL APIs without reshaping them. This is intentionally NOT the
// same shape as Atlas's public Place.latitude/Place.longitude fields; the
// conversion happens once, at the AtlasMap React boundary.
export type Coordinates = {
  lng: number;
  lat: number;
};

export type LocationStatus =
  | "idle"
  | "locating"
  | "active"
  | "denied"
  | "unavailable"
  | "timeout"
  | "unsupported"
  | "error";

export interface LocationState {
  status: LocationStatus;
  coords: Coordinates | null;
  accuracy: number | null;
  timestamp: number | null;
  message?: string;
}

export type PerformanceProfile = "low" | "medium" | "high";

export interface PerformanceCapabilities {
  hardwareConcurrency: number;
  deviceMemoryGB: number | null;
  devicePixelRatio: number;
  isMobile: boolean;
  webglTier: 0 | 1 | 2;
}

export interface PerformanceSettings {
  profile: PerformanceProfile;
  buildingsMinZoom: number;
  placesMinZoom: number;
  placeLimit: number;
  antialias: boolean;
  fadeDuration: number;
}

export type ThemeName = "light" | "dark";

export interface ThemeDefinition {
  name: ThemeName;
  styleUrl: string;
  background: string;
  surface: string;
  text: string;
  accent: string;
  building: {
    color: string;
    opacity: number;
  };
  place: {
    default: string;
    categories: Record<PlaceCategory, string>;
    halo: string;
  };
  userMarker: {
    fill: string;
    ring: string;
    accuracy: string;
  };
  mask: {
    color: string;
    opacity: number;
  };
}

export interface PlaceFeatureProperties {
  id: string;
  name: string;
  category: PlaceCategory;
}

export type PlaceFeature = GeoJSON.Feature<GeoJSON.Point, PlaceFeatureProperties>;
export type PlaceFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point, PlaceFeatureProperties>;

/** Pitch is Mapbox's own 2D/3D camera concept: tilted reads as "3D mode" for the grow-vs-highlight selection decision. */
export type SelectionMode = "2d" | "3d";
