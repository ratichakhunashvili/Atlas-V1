import type { ThemeDefinition } from "../mapTypes";

/** Temporary palette — swap once the final brand palette is ready. Nothing outside this file (and dark.ts) needs to change. */
export const lightTheme: ThemeDefinition = {
  name: "light",
  styleUrl: "mapbox://styles/mapbox/light-v11",
  background: "#f4f2ec",
  surface: "#ffffff",
  text: "#1b1d1f",
  accent: "#2563eb",
  building: {
    color: "#aab4c0",
    opacity: 0.75,
  },
  place: {
    default: "#6b7280",
    halo: "#ffffff",
    categories: {
      restaurant: "#e2622a",
      spa: "#0891b2",
      tour: "#c08a2e",
      shop: "#db2777",
      landmark: "#c08a2e",
      historical: "#9a6b1f",
      nature: "#3f9142",
      museum: "#8b5cf6",
      beach: "#0ea5a5",
      nightlife: "#7c3aed",
      attraction: "#2563eb",
      activity: "#0891b2",
      hotel: "#8b5cf6",
      other: "#6b7280",
    },
  },
  userMarker: {
    fill: "#2563eb",
    ring: "#ffffff",
    accuracy: "rgba(37, 99, 235, 0.15)",
  },
  mask: {
    color: "#0b0f14",
    opacity: 0.35,
  },
};
