import type { ThemeName } from "./mapTypes";

const STORAGE_KEY = "atlas:map-theme";

type Listener = (theme: ThemeName) => void;

function readStoredTheme(): ThemeName | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Map-scoped theme only — this does not touch Atlas's own app chrome/dark
 * mode (there isn't one yet). Defaults to 'light' unconditionally (ignoring
 * the system color-scheme preference) so the map reads bright/alive by
 * default; dark stays available as an explicit user choice via the toggle.
 */
class MapThemeService {
  private current: ThemeName = readStoredTheme() ?? "light";
  private listeners = new Set<Listener>();

  getTheme(): ThemeName {
    return this.current;
  }

  setTheme(theme: ThemeName): void {
    if (theme === this.current) return;
    this.current = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // storage unavailable (private mode, quota) — in-memory state still works
    }
    for (const listener of this.listeners) listener(theme);
  }

  toggle(): void {
    this.setTheme(this.current === "light" ? "dark" : "light");
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const mapThemeService = new MapThemeService();
