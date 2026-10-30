import type { ScreenKey } from "./screen-hrefs";

/*
 * The six check-in problem cases (1:1042 – 1:1127). Kept out of the client module
 * scan-screens.tsx so server pages can read the data: a constant imported from a "use client"
 * file arrives as a client reference, not the object.
 */

export type ScanProblem = {
  icon: string;
  title: string;
  body: string;
  primary: { label: string; to: ScreenKey };
  secondary: { label: string; to: ScreenKey };
  /** Which of the six review cases this is, and the next one. */
  caseNumber: number;
  next: ScreenKey;
};

export const SCAN_PROBLEMS = {
  notClose: {
    icon: "/atlas-ui/icon-pin-teal-26.svg",
    title: "You're not at Partner Place 2 yet",
    body: "You're about 400 m away. Check in when you arrive.",
    primary: { label: "Get directions", to: "Route" },
    secondary: { label: "Scan again", to: "Scan" },
    caseNumber: 1,
    next: "ScanProblemWrong",
  },
  wrongCode: {
    icon: "/atlas-ui/icon-qr-teal-26.svg",
    title: "This code isn't for Partner Place 2",
    body: "It belongs to a different place. Scan the Atlas code at Partner Place 2's counter.",
    primary: { label: "Scan again", to: "Scan" },
    secondary: { label: "Check in with my location", to: "Unlocked" },
    caseNumber: 2,
    next: "ScanProblemDone",
  },
  alreadyDone: {
    icon: "/atlas-ui/icon-check-teal-26.svg",
    title: "You've already checked in here",
    body: "Partner Place 2 is done for today and its achievement is unlocked.",
    primary: { label: "Back to my plan", to: "MyPlan" },
    secondary: { label: "See achievement", to: "AchievementDetailP2" },
    caseNumber: 3,
    next: "ScanProblemToday",
  },
  notInPlan: {
    icon: "/atlas-ui/icon-clock-teal-26.svg",
    title: "This place isn't in today's plan",
    body: "You can only check in at today's stops. Add Partner Place 4 to today's plan first.",
    primary: { label: "View Partner Place 4", to: "DetailP4" },
    secondary: { label: "Close", to: "Main" },
    caseNumber: 4,
    next: "ScanProblemGone",
  },
  placeGone: {
    icon: "/atlas-ui/icon-info-teal-26.svg",
    title: "Partner Place 3 isn't available anymore",
    body: "It's no longer offered for Hotel A guests, so you can't check in. Fix this stop in your plan.",
    primary: { label: "Fix this stop", to: "Repair" },
    secondary: { label: "Back to my plan", to: "MyPlan" },
    caseNumber: 5,
    next: "ScanProblemCamera",
  },
  cameraOff: {
    icon: "/atlas-ui/icon-camera-teal-26.svg",
    title: "Camera access is off",
    body: "Turn it on in your phone's settings, or check in with your location instead.",
    primary: { label: "Check in with my location", to: "Unlocked" },
    secondary: { label: "Why Atlas uses the camera", to: "PermCamera" },
    caseNumber: 6,
    next: "ScanProblem",
  },
} satisfies Record<string, ScanProblem>;
