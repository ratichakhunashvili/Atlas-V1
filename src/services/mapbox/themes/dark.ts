import type { ThemeDefinition } from "../mapTypes";

/** Temporary palette — swap once the final brand palette is ready. Nothing outside this file (and light.ts) needs to change. */
export const darkTheme: ThemeDefinition = {
  name: "dark",
  styleUrl: "mapbox://styles/mapbox/dark-v11",
  background: "#0b0f14",
  surface: "#151a21",
  text: "#e8eaed",
  accent: "#5b9bff",
  building: {
    color: "#3a4555",
    opacity: 0.8,
  },
  place: {
    default: "#9aa4b2",
    halo: "#0b0f14",
    categories: {
      restaurant: "#ff8a4c",
      spa: "#38bdf8",
      tour: "#e0b84f",
      shop: "#f472b6",
      landmark: "#e0b84f",
      historical: "#c99a3f",
      nature: "#5cc26a",
      museum: "#b794f6",
      beach: "#2dd4bf",
      nightlife: "#a78bfa",
      attraction: "#5b9bff",
      activity: "#38bdf8",
      hotel: "#b794f6",
      other: "#9aa4b2",
    },
  },
  userMarker: {
    fill: "#5b9bff",
    ring: "#0b0f14",
    accuracy: "rgba(91, 155, 255, 0.18)",
  },
  mask: {
    color: "#000000",
    opacity: 0.55,
  },
};
