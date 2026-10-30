/*
 * Screen keys and the route each is built at — the only data client components need.
 *
 * Split from screens.ts (which adds the Figma frame names and node ids) so the Figma table
 * stays out of the browser bundle; keys and routes live only here.
 *
 * Screens are keyed by the Figma frame's short name — the part before " · " — because the
 * design's prototype links use exactly those names in their layer names, for example
 * "Back ⇒ SignIn" or "Fix ⇒ Repair". A null href means the screen is not built yet: callers
 * render an inert element instead of a dead link.
 */

export const SCREEN_HREFS = {
  Main: "/",
  Index: "/guide",
  StatesKit: "/states",
  BottomBarKit: "/kit/bottom-bar",
  NavLiquid: "/kit/bottom-bar-motion",

  Welcome: "/welcome",
  // The real account screens (src/app/(auth)), connected to Auth.js.
  SignIn: "/login",
  ForgotPassword: "/forgot-password",
  ForgotSent: "/forgot-password/sent",
  QRInvalid: "/qr-invalid",
  NoStay: "/no-stay",
  PermLocation: "/permissions/location",
  PermCamera: "/permissions/camera",

  ToastLocation: "/map/centred-on-you",
  ToastHotel: "/map/centred-on-hotel",
  MapNextPath: "/map/next-stop",
  List: "/list",
  NoMatch: "/no-match",

  Detail: "/place/partner-2",
  DetailP1: "/place/partner-1",
  DetailP4: "/place/partner-4",
  FacilityDetail: "/place/spa",
  FacilityPool: "/place/pool",
  AttractionDetail: "/place/attraction-1",

  Preferences: "/preferences",
  PlanBuild: "/plan/building",
  PlanBuildDone: "/plan/ready",
  MyPlan: "/plan",
  MyPlanEmpty: "/plan/empty",
  MyPlanReplaced: "/plan/replaced",
  MyPlanRemoved: "/plan/removed",
  MyPlanAddedSpa: "/plan/added-spa",
  MyPlanAddedPool: "/plan/added-pool",
  MyPlanAddedA1: "/plan/added-attraction-1",
  MyPlanAddedP4: "/plan/added-partner-4",
  Repair: "/plan/repair",
  RepairConfirm: "/plan/repair/confirm",
  Route: "/route",
  RouteP1: "/route/partner-1",
  RouteP4: "/route/partner-4",
  RouteA1: "/route/attraction-1",

  Scan: "/scan",
  ScanProblem: "/scan/not-close-enough",
  ScanProblemWrong: "/scan/wrong-code",
  ScanProblemDone: "/scan/already-checked-in",
  ScanProblemToday: "/scan/not-in-plan",
  ScanProblemGone: "/scan/place-unavailable",
  ScanProblemCamera: "/scan/camera-off",
  CheckedIn: "/checked-in",
  ARUnlock: "/ar-unlock",
  Unlocked: "/unlocked",
  UnlockedA1: "/unlocked/attraction-1",
  UnlockedP1: "/unlocked/partner-1",
  NextPath: "/next-stop",

  Stay: "/profile",
  Achievements: "/achievements",
  AchievementDetail: "/achievements/achievement-2",
  AchievementDetailP1: "/achievements/achievement-1",
  AchievementDetailP2: "/achievements/achievement-3",
  AchievementDetailA1: "/achievements/achievement-4",
  AchievementDetailP4: "/achievements/achievement-5",
  Permissions: "/profile/permissions",
  Privacy: "/privacy",
  PrivacyPublic: "/terms",
  PrivacyDelete: "/privacy/delete-account",

  // Added to the design later (frames 70:*).
  SignUp: "/signup",
  SignUpEmailUsed: null,
  SignUpWeak: null,
  ResetPassword: "/reset-password",
  ResetDone: "/reset-password/done",
  ResetExpired: "/reset-password/expired",
  ScanHotel: "/scan-hotel",
  StayConfirmed: "/stay/confirmed",
  StayEnded: "/stay/ended",
  MapNoLocation: "/map/location-off",
  ReorderStops: "/plan/reorder",
  PlanError: "/plan/error",
  PlanBuildFailed: "/plan/build-failed",
  PrefsEdit: "/preferences/edit",
  SignOutConfirm: "/profile/sign-out",
  AccountDeleted: "/account-deleted",
  // Admin console (src/app/(console) and (admin-auth)).
  AdminSignIn: "/admin/sign-in",
  AdminDenied: "/admin/denied",
  AdminHotels: "/admin",
  AdminHotelForm: "/admin/hotels/edit",
  AdminPlaces: "/admin/places",
  AdminPlaceForm: "/admin/places/edit",
  AdminPartnerships: "/admin/partners",
  AdminPartnershipForm: "/admin/partners/edit",
  AdminFacilities: "/admin/facilities",
  AdminFacilityForm: "/admin/facilities/edit",
  AdminQR: "/admin/qr",
  AdminQRCreate: "/admin/qr/new",
  AdminQRCreated: "/admin/qr/created",
  AdminQRRevoke: "/admin/qr/revoke",
  AdminAchievements: "/admin/achievements",
  AdminAchievementForm: "/admin/achievements/edit",
} as const satisfies Record<string, string | null>;

export type ScreenKey = keyof typeof SCREEN_HREFS;

/** The route once the screen exists, otherwise null, so callers never render a dead link. */
export function screenHref(key: ScreenKey): string | null {
  return SCREEN_HREFS[key];
}
