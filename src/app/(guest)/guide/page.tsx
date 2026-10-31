import type { Metadata } from "next";
import Link from "next/link";
import { AtlasIcon, AtlasLogo } from "@/components/atlas-ui/asset";
import { DemoResetButton } from "@/components/atlas-ui/demo/reset-button";
import { screenHref, type ScreenKey } from "@/components/atlas-ui/screens";

/*
 * Index · Start here: prototype guide — Figma frame 70:4452 (an updated copy of 1:1639).
 *
 * Same groups, same copy and same order as the design. A row links through once its screen
 * has been built; until then it is dimmed and inert rather than a dead link.
 */

type IndexLink = { title: string; subtitle: string; screen: ScreenKey };
type IndexGroup = { label: string; links: IndexLink[] };

const GROUPS: readonly IndexGroup[] = [
  {
    label: "Start like a guest",
    links: [
      {
        title: "Scan the hotel QR",
        subtitle: "Welcome → sign in → location → plan my time",
        screen: "Welcome",
      },
    ],
  },
  {
    label: "Missions tab",
    links: [
      { title: "Map (home)", subtitle: "The main screen", screen: "Main" },
      { title: "List", subtitle: "Same places as a list", screen: "List" },
      { title: "My plan", subtitle: "Today with a done, next and broken stop", screen: "MyPlan" },
      { title: "My plan, empty", subtitle: "Before planning", screen: "MyPlanEmpty" },
    ],
  },
  {
    label: "Scan tab",
    links: [
      { title: "Scanner", subtitle: "Tap the frame to simulate a good scan", screen: "Scan" },
      { title: "Check-in problems", subtitle: "Six cases, in the frames next to it", screen: "ScanProblem" },
    ],
  },
  {
    label: "Profile tab",
    links: [
      { title: "Profile", subtitle: "Stay, achievements, preferences, settings", screen: "Stay" },
      { title: "Achievements", subtitle: "2 of 5 unlocked", screen: "Achievements" },
    ],
  },
  {
    label: "Key journeys",
    links: [
      { title: "Check in at a partner", subtitle: "Details → camera → scan → unlocked", screen: "Detail" },
      { title: "Unlock an attraction", subtitle: "Details → camera view → unlocked", screen: "AttractionDetail" },
      { title: "Fix an unavailable stop", subtitle: "Replace, or remove with confirmation", screen: "Repair" },
      { title: "Plan my time", subtitle: "Choose time and interests", screen: "Preferences" },
    ],
  },
  {
    label: "After a check-in",
    links: [
      { title: "Achievement unlocked", subtitle: "Then choose your next stop", screen: "UnlockedP1" },
      { title: "Choose your next stop", subtitle: "Three eligible places, middle one featured", screen: "NextPath" },
      {
        title: "Alternative: choose in the map sheet",
        subtitle: "Same choice, without leaving the map",
        screen: "MapNextPath",
      },
    ],
  },
  {
    label: "Other outcomes",
    links: [
      { title: "Hotel code not recognised", subtitle: "Bad or old QR", screen: "QRInvalid" },
      { title: "No active stay", subtitle: "Signed in, but no stay today", screen: "NoStay" },
      { title: "Checked in, no achievement", subtitle: "A stop like the pool", screen: "CheckedIn" },
      { title: "No partner fits", subtitle: "Hotel facilities instead", screen: "NoMatch" },
      { title: "Reset password", subtitle: "Send link, then check email", screen: "ForgotPassword" },
    ],
  },
  {
    label: "Account and hotel entry",
    links: [
      { title: "Create account", subtitle: "Name, email, password", screen: "SignUp" },
      { title: "Sign-up: email already used", subtitle: "Error state", screen: "SignUpEmailUsed" },
      { title: "Sign-up: weak password", subtitle: "Error state", screen: "SignUpWeak" },
      { title: "Reset password", subtitle: "The page the email link opens", screen: "ResetPassword" },
      { title: "Password changed", subtitle: "Success", screen: "ResetDone" },
      { title: "Reset link expired", subtitle: "Invalid or old link", screen: "ResetExpired" },
      { title: "Scan the hotel code", subtitle: "Join a hotel from the app", screen: "ScanHotel" },
      { title: "Stay confirmed", subtitle: "After a good hotel scan", screen: "StayConfirmed" },
      { title: "Stay ended", subtitle: "After check-out", screen: "StayEnded" },
    ],
  },
  {
    label: "Plan, map and profile states",
    links: [
      { title: "Reorder stops", subtitle: "From My plan after adding a stop", screen: "ReorderStops" },
      { title: "Plan failed to load", subtitle: "Retry", screen: "PlanError" },
      { title: "Couldn't build the plan", subtitle: "Retry", screen: "PlanBuildFailed" },
      { title: "Map without location", subtitle: "Hotel-centred", screen: "MapNoLocation" },
      { title: "Edit preferences", subtitle: "From Profile", screen: "PrefsEdit" },
      { title: "Sign-out confirmation", subtitle: "Dialog", screen: "SignOutConfirm" },
      { title: "Account deleted", subtitle: "After delete", screen: "AccountDeleted" },
    ],
  },
  {
    label: "Admin panel",
    links: [{ title: "Admin sign-in", subtitle: "Desktop. All admin pages open from the sidebar", screen: "AdminSignIn" }],
  },
  {
    label: "Design-review states",
    links: [
      { title: "My plan, stop replaced", subtitle: "Opens this state and sets the demo plan to it", screen: "MyPlanReplaced" },
      { title: "My plan, stop removed", subtitle: "Opens this state and sets the demo plan to it", screen: "MyPlanRemoved" },
      { title: "My plan, spa added", subtitle: "Runs over: the time warning", screen: "MyPlanAddedSpa" },
      { title: "My plan, pool added", subtitle: "Runs over: the time warning", screen: "MyPlanAddedPool" },
      { title: "My plan, Attraction 1 added", subtitle: "Runs over: the time warning", screen: "MyPlanAddedA1" },
      { title: "My plan, Partner Place 4 added", subtitle: "Runs over: the time warning", screen: "MyPlanAddedP4" },
      { title: "Remove a stop", subtitle: "The confirmation dialog", screen: "RepairConfirm" },
      { title: "Delete account", subtitle: "The confirmation dialog", screen: "PrivacyDelete" },
      { title: "Terms and privacy, signed out", subtitle: "Placeholders until approved text exists", screen: "PrivacyPublic" },
    ],
  },
  {
    label: "Reference",
    links: [
      { title: "Bottom bar motion", subtitle: "Click the tabs: the notch slides", screen: "NavLiquid" },
      { title: "Shared states", subtitle: "Banners, loading, toasts, errors", screen: "StatesKit" },
    ],
  },
];

const ROW = "flex h-[56px] w-full items-center gap-[12px] border-b border-atlas-beige";

function IndexRow({ title, subtitle, screen }: IndexLink) {
  const href = screenHref(screen);
  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-[2px] text-left">
        <span className="font-manrope text-[15px] font-semibold leading-[20px] text-atlas-teal">{title}</span>
        <span className="w-full font-manrope text-[13px] leading-[18px] text-atlas-slate">{subtitle}</span>
      </span>
      <AtlasIcon src="/atlas-ui/icon-chevron.svg" size={16} className="shrink-0" />
    </>
  );

  if (!href) {
    return (
      <span className={`${ROW} opacity-40`} aria-disabled="true" title={`Not built yet`}>
        {body}
      </span>
    );
  }

  return (
    <Link href={href} className={ROW}>
      {body}
    </Link>
  );
}

export const metadata: Metadata = { title: "Prototype guide" };

export default function AtlasUiIndexPage() {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[720px] flex-col items-start gap-[22px] bg-atlas-paper px-[16px] pb-[118px] pt-[calc(24px+env(safe-area-inset-top))]">
      <header className="flex w-full flex-col items-start gap-[8px]">
        <AtlasLogo tone="teal" width={42} height={48} />
        <p className="font-grotesk text-[11px] font-medium uppercase leading-[14px] tracking-[0.88px] text-atlas-slate">
          Design review
        </p>
        <h1 className="font-grotesk text-[26px] font-bold leading-[33px] text-atlas-teal">Atlas prototype guide</h1>
        <p className="w-full font-manrope text-[14px] leading-[21px] text-atlas-slate">
          Open Present mode here and tap any line. The bottom bar has three tabs: Missions (the map and your plan),
          Scan, and Profile.
        </p>
      </header>

      <section aria-labelledby="demo-heading" className="flex w-full flex-col items-start gap-[8px] rounded-[16px] border border-dashed border-atlas-umber p-[14px]">
        <h2 id="demo-heading" className="font-grotesk text-[16px] font-bold leading-[20px] text-atlas-teal">
          Prototype demo
        </h2>
        <p className="w-full font-manrope text-[14px] leading-[21px] text-atlas-ink">
          Your choices, plan, check-ins and achievements are kept in this browser only, so the screens agree with each other.
          Nothing is sent anywhere and there are no accounts. Design-review states below set the demo plan to the state they show.
        </p>
        <DemoResetButton />
      </section>

      {GROUPS.map((group) => (
        <section key={group.label} className="flex w-full flex-col items-start">
          <h2 className="font-grotesk text-[11px] font-medium uppercase leading-[14px] tracking-[0.88px] text-atlas-slate">
            {group.label}
          </h2>
          {group.links.map((link) => (
            <IndexRow key={link.title} {...link} />
          ))}
        </section>
      ))}
    </div>
  );
}
