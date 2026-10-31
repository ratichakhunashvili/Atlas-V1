/*
 * Every frame in the Atlas Figma file (3N0YrlADgeuFyp8I8oh5of): Figma frame names and node ids
 * joined onto the keys and routes in screen-hrefs.ts. Split so client code imports only
 * screen-hrefs.ts and this Figma table never ships to the browser; /guide and /states (server
 * pages) read it from here.
 */

import { SCREEN_HREFS, type ScreenKey } from "./screen-hrefs";

export { screenHref } from "./screen-hrefs";
export type { ScreenKey } from "./screen-hrefs";

export type AtlasScreen = {
  key: ScreenKey;
  /** Frame name as it reads in Figma. */
  figmaName: string;
  /** Empty for screens the prototype adds without a frame of their own (built from a sibling frame). */
  figmaNodeId: string;
  href: string;
  built: boolean;
};

const FIGMA_FRAMES = {
  Main: { figmaName: "Main · Missions › Map (home)", figmaNodeId: "1:205" },
  Index: { figmaName: "Index · Start here: prototype guide", figmaNodeId: "70:4452" },
  StatesKit: { figmaName: "StatesKit · Shared states", figmaNodeId: "1:1491" },
  BottomBarKit: { figmaName: "Bottom bar", figmaNodeId: "7:795" },
  NavLiquid: { figmaName: "NavLiquid · Bottom bar motion", figmaNodeId: "1:1463" },

  Welcome: { figmaName: "Welcome · Welcome (after hotel QR)", figmaNodeId: "1:690" },
  SignIn: { figmaName: "SignIn · Sign in / create account", figmaNodeId: "1:722" },
  ForgotPassword: { figmaName: "ForgotPassword · Reset password", figmaNodeId: "1:1271" },
  ForgotSent: { figmaName: "ForgotSent · Reset link sent", figmaNodeId: "1:1286" },
  QRInvalid: { figmaName: "QRInvalid · Hotel code not recognised", figmaNodeId: "1:1254" },
  NoStay: { figmaName: "NoStay · No active stay", figmaNodeId: "1:1225" },
  PermLocation: { figmaName: "PermLocation · Location permission", figmaNodeId: "1:810" },
  PermCamera: { figmaName: "PermCamera · Camera permission", figmaNodeId: "1:841" },

  ToastLocation: { figmaName: "Toast · Centred on your location", figmaNodeId: "1:5054" },
  ToastHotel: { figmaName: "Toast · Centred on Hotel A", figmaNodeId: "1:5059" },
  MapNextPath: { figmaName: "MapNextPath · Choose in the map sheet", figmaNodeId: "1:5494" },
  List: { figmaName: "List · Missions › List", figmaNodeId: "1:252" },
  NoMatch: { figmaName: "NoMatch · Missions › No partner fits", figmaNodeId: "1:352" },

  Detail: { figmaName: "Detail · Place details (Partner Place 2)", figmaNodeId: "1:280" },
  DetailP1: { figmaName: "DetailP1 · Partner Place 1 (visited today)", figmaNodeId: "1:1799" },
  DetailP4: { figmaName: "DetailP4 · Partner Place 4 (not in plan)", figmaNodeId: "1:1867" },
  FacilityDetail: { figmaName: "FacilityDetail · Hotel facility (Spa)", figmaNodeId: "1:872" },
  FacilityPool: { figmaName: "FacilityPool · Pool (hotel facility)", figmaNodeId: "1:1933" },
  AttractionDetail: { figmaName: "AttractionDetail · Attraction details", figmaNodeId: "1:925" },

  Preferences: { figmaName: "Preferences · Plan my time", figmaNodeId: "1:590" },
  PlanBuild: { figmaName: "PlanBuild · Building a plan (loading)", figmaNodeId: "1:1144" },
  PlanBuildDone: { figmaName: "PlanBuildDone · Plan ready", figmaNodeId: "1:1156" },
  MyPlan: { figmaName: "MyPlan · Missions › My plan", figmaNodeId: "1:489" },
  MyPlanEmpty: { figmaName: "MyPlanEmpty · Missions › My plan (empty)", figmaNodeId: "1:1195" },
  MyPlanReplaced: { figmaName: "MyPlanReplaced · My plan after replacing stop 3", figmaNodeId: "1:2180" },
  MyPlanRemoved: { figmaName: "MyPlanRemoved · My plan after removing stop 3", figmaNodeId: "1:2285" },
  MyPlanAddedSpa: { figmaName: "MyPlanAddedSpa · My plan with the spa added", figmaNodeId: "1:2378" },
  MyPlanAddedPool: { figmaName: "MyPlanAddedPool · My plan with the pool added", figmaNodeId: "1:2499" },
  MyPlanAddedA1: { figmaName: "MyPlanAddedA1 · My plan with Attraction 1 added", figmaNodeId: "1:2620" },
  MyPlanAddedP4: { figmaName: "MyPlanAddedP4 · My plan with Partner Place 4 added", figmaNodeId: "1:2741" },
  Repair: { figmaName: "Repair · Fix an unavailable stop", figmaNodeId: "1:778" },
  RepairConfirm: { figmaName: "RepairConfirm · Remove stop confirmation", figmaNodeId: "1:1423" },
  Route: { figmaName: "Route · Walking route", figmaNodeId: "1:731" },
  RouteP1: { figmaName: "RouteP1 · Route to Partner Place 1", figmaNodeId: "1:2041" },
  RouteP4: { figmaName: "RouteP4 · Route to Partner Place 4", figmaNodeId: "1:2088" },
  RouteA1: { figmaName: "RouteA1 · Route to Attraction 1", figmaNodeId: "1:2133" },

  Scan: { figmaName: "Scan · Scan (centre tab)", figmaNodeId: "1:410" },
  ScanProblem: { figmaName: "ScanProblem · Not close enough", figmaNodeId: "1:1042" },
  ScanProblemWrong: { figmaName: "ScanProblemWrong · Wrong code", figmaNodeId: "1:1059" },
  ScanProblemDone: { figmaName: "ScanProblemDone · Already checked in", figmaNodeId: "1:1076" },
  ScanProblemToday: { figmaName: "ScanProblemToday · Not in today’s plan", figmaNodeId: "1:1093" },
  ScanProblemGone: { figmaName: "ScanProblemGone · Place unavailable", figmaNodeId: "1:1110" },
  ScanProblemCamera: { figmaName: "ScanProblemCamera · Camera off", figmaNodeId: "1:1127" },
  CheckedIn: { figmaName: "CheckedIn · Checked in (no achievement)", figmaNodeId: "1:1024" },
  ARUnlock: { figmaName: "ARUnlock · AR unlock (attraction)", figmaNodeId: "1:436" },
  Unlocked: { figmaName: "Unlocked · Achievement unlocked", figmaNodeId: "1:466" },
  UnlockedA1: { figmaName: "UnlockedA1 · Unlocked at Attraction 1", figmaNodeId: "1:2018" },
  UnlockedP1: { figmaName: "UnlockedP1 · Unlocked at Partner Place 1", figmaNodeId: "1:5064" },
  NextPath: { figmaName: "NextPath · Choose your next stop", figmaNodeId: "1:5087" },

  Stay: { figmaName: "Stay · Profile", figmaNodeId: "1:1542" },
  Achievements: { figmaName: "Achievements · Profile › Achievements", figmaNodeId: "1:624" },
  AchievementDetail: { figmaName: "AchievementDetail · Achievement details", figmaNodeId: "1:989" },
  AchievementDetailP1: { figmaName: "AchievementDetailP1 · Achievement 1 details", figmaNodeId: "1:1983" },
  // The design draws details for the two unlocked achievements only; these three reuse that frame
  // so every achievement a screen mentions has somewhere to go.
  AchievementDetailP2: { figmaName: "Achievement 3 details (from 1:989)", figmaNodeId: "" },
  AchievementDetailA1: { figmaName: "Achievement 4 details (from 1:989)", figmaNodeId: "" },
  AchievementDetailP4: { figmaName: "Achievement 5 details (from 1:989)", figmaNodeId: "" },
  Permissions: { figmaName: "Permissions · Profile › Permissions", figmaNodeId: "1:2862" },
  Privacy: { figmaName: "Privacy · Help and privacy", figmaNodeId: "1:1303" },
  PrivacyPublic: { figmaName: "PrivacyPublic · Terms and privacy (signed out)", figmaNodeId: "1:2888" },
  PrivacyDelete: { figmaName: "PrivacyDelete · Delete account confirmation", figmaNodeId: "1:1357" },

  SignUp: { figmaName: "SignUp · Create account", figmaNodeId: "70:3586" },
  SignUpEmailUsed: { figmaName: "SignUpEmailUsed · Create account: email already used", figmaNodeId: "70:3615" },
  SignUpWeak: { figmaName: "SignUpWeak · Create account: weak password", figmaNodeId: "70:3654" },
  ResetPassword: { figmaName: "ResetPassword · Set a new password", figmaNodeId: "70:3683" },
  ResetDone: { figmaName: "ResetDone · Password changed", figmaNodeId: "70:3705" },
  ResetExpired: { figmaName: "ResetExpired · Reset link expired", figmaNodeId: "70:3715" },
  ScanHotel: { figmaName: "ScanHotel · Scan the hotel code", figmaNodeId: "70:3730" },
  StayConfirmed: { figmaName: "StayConfirmed · Stay confirmed", figmaNodeId: "70:3750" },
  StayEnded: { figmaName: "StayEnded · Stay ended", figmaNodeId: "70:3765" },
  MapNoLocation: { figmaName: "location is off. (Map without location)", figmaNodeId: "70:4761" },
  ReorderStops: { figmaName: "ReorderStops · Reorder stops", figmaNodeId: "70:3786" },
  PlanError: { figmaName: "PlanError · Plan failed to load", figmaNodeId: "70:3886" },
  PlanBuildFailed: { figmaName: "PlanBuildFailed · Couldn’t build the plan", figmaNodeId: "70:3918" },
  PrefsEdit: { figmaName: "PrefsEdit · Edit preferences", figmaNodeId: "70:3986" },
  SignOutConfirm: { figmaName: "SignOutConfirm · Sign-out confirmation", figmaNodeId: "70:4020" },
  AccountDeleted: { figmaName: "AccountDeleted · Account deleted", figmaNodeId: "70:4125" },
  AdminSignIn: { figmaName: "AdminSignIn · Admin sign-in", figmaNodeId: "70:780" },
  AdminDenied: { figmaName: "AdminDenied · Access denied", figmaNodeId: "70:800" },
  AdminHotels: { figmaName: "AdminHotels · Hotels", figmaNodeId: "70:811" },
  AdminHotelForm: { figmaName: "AdminHotelForm · Hotel: create or edit", figmaNodeId: "70:900" },
  AdminPlaces: { figmaName: "AdminPlaces · Places", figmaNodeId: "70:978" },
  AdminPlaceForm: { figmaName: "AdminPlaceForm · Place: create or edit", figmaNodeId: "70:1100" },
  AdminPartnerships: { figmaName: "AdminPartnerships · Hotel partners", figmaNodeId: "70:1190" },
  AdminPartnershipForm: { figmaName: "AdminPartnershipForm · Partnership: link or edit", figmaNodeId: "70:1311" },
  AdminFacilities: { figmaName: "AdminFacilities · Facilities", figmaNodeId: "70:1382" },
  AdminFacilityForm: { figmaName: "AdminFacilityForm · Facility: create or edit", figmaNodeId: "70:1471" },
  AdminQR: { figmaName: "AdminQR · QR codes", figmaNodeId: "70:1549" },
  AdminQRCreate: { figmaName: "AdminQRCreate · Create a code", figmaNodeId: "70:1664" },
  AdminQRCreated: { figmaName: "AdminQRCreated · Code created", figmaNodeId: "70:1730" },
  AdminQRRevoke: { figmaName: "AdminQRRevoke · Revoke a code", figmaNodeId: "70:1796" },
  AdminAchievements: { figmaName: "AdminAchievements · Achievements", figmaNodeId: "70:1920" },
  AdminAchievementForm: { figmaName: "AdminAchievementForm · Achievement: create or edit", figmaNodeId: "70:2027" },
} satisfies Record<ScreenKey, { figmaName: string; figmaNodeId: string }>;

export const ATLAS_SCREENS: readonly AtlasScreen[] = (Object.keys(SCREEN_HREFS) as ScreenKey[]).map((key) => {
  const href: string | null = SCREEN_HREFS[key];
  return { key, ...FIGMA_FRAMES[key], href: href ?? "", built: href !== null };
});

const BY_KEY = new Map(ATLAS_SCREENS.map((screen) => [screen.key, screen] as const));

export function atlasScreen(key: ScreenKey): AtlasScreen {
  const screen = BY_KEY.get(key);
  if (!screen) throw new Error(`Unknown Atlas screen: ${key}`);
  return screen;
}
