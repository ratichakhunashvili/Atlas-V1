import type { IControl, Map as MapboxMap } from "mapbox-gl";
import type { LocationStatus } from "@/services/location";
import type { ThemeName } from "@/services/mapbox/mapTypes";

const LOCATE_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
  <circle cx="12" cy="12" r="3"/>
  <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
</svg>`;

const SUN_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
  <circle cx="12" cy="12" r="4"/>
  <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>
</svg>`;

const MOON_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>
</svg>`;

/**
 * Wraps a button as a Mapbox custom control (`IControl`), inside the same
 * `mapboxgl-ctrl mapboxgl-ctrl-group` container Mapbox's own controls use.
 * Returning the bare button from `onAdd()` (skipping this wrapper) renders in
 * the right visual spot but without Mapbox's stacking/positioning context —
 * the canvas can end up intercepting clicks meant for the button.
 */
function wrapAsControl(element: HTMLElement): IControl {
  const container = document.createElement("div");
  container.className = "mapboxgl-ctrl mapboxgl-ctrl-group";
  container.appendChild(element);

  return {
    onAdd: () => container,
    onRemove: () => container.remove(),
  };
}

export function addLocateControl(
  map: MapboxMap,
  onClick: () => void
): { control: IControl; setStatus: (status: LocationStatus) => void } {
  const button = document.createElement("button");
  button.className = "atlas-map-control-btn atlas-locate-btn";
  button.type = "button";
  button.setAttribute("aria-label", "Locate me");
  button.title = "Locate me";
  button.innerHTML = LOCATE_ICON;
  button.addEventListener("click", onClick);

  const control = wrapAsControl(button);
  map.addControl(control, "top-right");

  return {
    control,
    setStatus: (status) => {
      button.dataset.status = status;
    },
  };
}

export function addThemeToggleControl(
  map: MapboxMap,
  initial: ThemeName,
  onToggle: () => void
): { control: IControl; setTheme: (theme: ThemeName) => void } {
  const button = document.createElement("button");
  button.className = "atlas-map-control-btn atlas-theme-btn";
  button.type = "button";
  button.setAttribute("aria-label", "Toggle dark/light theme");
  button.title = "Toggle theme";
  button.addEventListener("click", onToggle);

  const setTheme = (theme: ThemeName): void => {
    button.innerHTML = theme === "dark" ? MOON_ICON : SUN_ICON;
    button.dataset.theme = theme;
  };
  setTheme(initial);

  const control = wrapAsControl(button);
  map.addControl(control, "top-right");

  return { control, setTheme };
}

/**
 * A 2D/3D toggle. The label always names the view you would switch TO, so "2D" while tilted and "3D" while flat.
 * Gives every guest a usable flat fallback (and a way back to the tilted view) without any gesture.
 */
export function addViewModeControl(
  map: MapboxMap,
  initial: "3d" | "2d",
  onToggle: () => void
): { control: IControl; setMode: (mode: "3d" | "2d") => void } {
  const button = document.createElement("button");
  button.className = "atlas-map-control-btn atlas-view-btn";
  button.type = "button";
  button.addEventListener("click", onToggle);

  const setMode = (mode: "3d" | "2d"): void => {
    button.textContent = mode === "3d" ? "2D" : "3D";
    const label = mode === "3d" ? "Switch to flat 2D view" : "Switch to tilted 3D view";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.dataset.mode = mode;
  };
  setMode(initial);

  const control = wrapAsControl(button);
  map.addControl(control, "top-right");

  return { control, setMode };
}

/**
 * A framing toggle for pages that give the map a focus area (e.g. a sample trip): one tap flips between the focus
 * area and the whole-country Georgia overview. The label names where a tap will take you.
 */
export function addFramingControl(
  map: MapboxMap,
  initial: "georgia" | "focus",
  focusLabel: string,
  onToggle: () => void
): { control: IControl; setTarget: (target: "georgia" | "focus") => void } {
  const button = document.createElement("button");
  button.className = "atlas-map-control-btn atlas-framing-btn";
  button.type = "button";
  button.addEventListener("click", onToggle);

  const setTarget = (target: "georgia" | "focus"): void => {
    button.textContent = target === "focus" ? "Georgia" : focusLabel;
    const label = target === "focus" ? "Show the whole of Georgia" : `Zoom to the ${focusLabel.toLowerCase()}`;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.dataset.target = target;
  };
  setTarget(initial);

  const control = wrapAsControl(button);
  map.addControl(control, "top-right");

  return { control, setTarget };
}
