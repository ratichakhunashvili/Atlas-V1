/*
 * Screen keys from the Atlas Figma file and the route each is served at in this app.
 *
 * Keys are the Figma frame short names (the part before " · "), as in the prototype these
 * components came from. A null href means the screen has not been brought into the app yet:
 * AtlasLink renders an inert element instead of a dead link. Each phase that ports a screen
 * fills in its route here.
 */

export const SCREEN_HREFS = {
  Main: "/",
  Welcome: null,
  SignIn: "/login",
  SignUp: "/signup",
  ForgotPassword: null,
  PermLocation: null,
  PrivacyPublic: null,
  StayConfirmed: null,

  AdminSignIn: "/admin/sign-in",
  AdminDenied: "/admin/denied",
  AdminHotels: "/admin",
} as const satisfies Record<string, string | null>;

export type ScreenKey = keyof typeof SCREEN_HREFS;

/** The route once the screen exists, otherwise null, so callers never render a dead link. */
export function screenHref(key: ScreenKey): string | null {
  return SCREEN_HREFS[key];
}
