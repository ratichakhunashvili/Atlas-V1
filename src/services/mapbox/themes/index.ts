import type { ThemeDefinition, ThemeName } from "../mapTypes";
import { lightTheme } from "./light";
import { darkTheme } from "./dark";

export const THEMES: Record<ThemeName, ThemeDefinition> = {
  light: lightTheme,
  dark: darkTheme,
};

export function getTheme(name: ThemeName): ThemeDefinition {
  return THEMES[name];
}
