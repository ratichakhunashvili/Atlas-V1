import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { AtlasAsset, AtlasIcon } from "./asset";
import { screenHref, type ScreenKey } from "./screen-hrefs";

/*
 * Atlas navigation — Figma component "Bottom bar" (node 1:21, variants at 7:795).
 *
 * Three tabs: Missions (map and plan), Scan, Profile. One component, three presentations:
 *
 * - 390 px and wider (phones): the design's bar, exactly. The active tab lifts into a raised
 *   teal button in a notch cut out of the bar; the notch is part of the exported artwork, so
 *   each active tab has its own bar file and the composition keeps its 390 geometry (tab boxes
 *   122 wide at x = 12, 134 and 256), centred on wider phones.
 * - Narrower than 390: the artwork cannot shrink without distorting, so a flexible bar with the
 *   same colours, icons and raised active button takes its place. Every tab keeps a 44 px target.
 * - Wide layouts (tablets, desktops, phones in landscape): a navigation rail on the left edge.
 *   The page keeps clear of it through --atlas-rail-w (globals.css).
 */

export type AtlasTab = "missions" | "scan" | "profile";

type TabSpec = {
  tab: AtlasTab;
  label: string;
  left: number;
  screen: ScreenKey;
  activeIcon: string;
  idleIcon: string;
};

const TABS: readonly TabSpec[] = [
  {
    tab: "missions",
    label: "Missions",
    left: 12,
    screen: "Main",
    activeIcon: "/atlas-ui/icon-compass-active.svg",
    idleIcon: "/atlas-ui/icon-compass.svg",
  },
  {
    tab: "scan",
    label: "Scan",
    left: 134,
    screen: "Scan",
    activeIcon: "/atlas-ui/icon-qr-active.svg",
    idleIcon: "/atlas-ui/icon-qr.svg",
  },
  {
    tab: "profile",
    label: "Profile",
    left: 256,
    screen: "Stay",
    activeIcon: "/atlas-ui/icon-profile-active.svg",
    idleIcon: "/atlas-ui/icon-profile.svg",
  },
];

const BAR_ARTWORK: Record<AtlasTab, string> = {
  missions: "/atlas-ui/nav-bar-missions.svg",
  scan: "/atlas-ui/nav-bar-scan.svg",
  profile: "/atlas-ui/nav-bar-profile.svg",
};

/**
 * The active tab is never a link to itself. With `onSelect` the tabs report the tap instead of
 * navigating (the NavLiquid motion reference).
 */
function Tab({
  spec,
  isActive,
  onSelect,
  style,
  className,
  children,
}: {
  spec: TabSpec;
  isActive: boolean;
  onSelect?: (tab: AtlasTab) => void;
  style?: CSSProperties;
  className: string;
  children: ReactNode;
}) {
  if (isActive) {
    return (
      <span style={style} className={className} aria-current="page">
        {children}
      </span>
    );
  }
  if (onSelect) {
    return (
      <button type="button" onClick={() => onSelect(spec.tab)} style={style} className={className}>
        {children}
      </button>
    );
  }
  const href = screenHref(spec.screen);
  if (!href) {
    return (
      <span style={style} className={className} aria-disabled="true">
        {children}
      </span>
    );
  }
  return (
    <Link href={href} style={style} className={className}>
      {children}
    </Link>
  );
}

const RAISED = "flex size-[52px] items-center justify-center rounded-[26px] bg-atlas-teal shadow-[0px_4px_12px_0px_rgba(28,41,41,0.22)]";

/**
 * The design's bar: exported artwork plus absolutely placed tabs, 390 wide. The artwork's soft
 * shadow reaches 2px below the 96px frame; clipping it keeps pages at the design's 844.
 */
function DesignBar({ active, onSelect }: { active: AtlasTab; onSelect?: (tab: AtlasTab) => void }) {
  return (
    <div className="relative mx-auto hidden h-[96px] w-[390px] overflow-hidden min-[390px]:block">
      <AtlasAsset src={BAR_ARTWORK[active]} width={386} height={76} className="absolute left-[2px] top-[22px]" />
      {TABS.map((spec) =>
        spec.tab === active ? (
          <Tab key={spec.tab} spec={spec} isActive style={{ left: spec.left }} className="absolute top-0 block h-[84px] w-[122px]">
            <span className={`absolute left-[35px] top-[2px] ${RAISED}`}>
              <AtlasIcon src={spec.activeIcon} size={24} />
            </span>
            <span className="absolute left-0 top-[64px] w-full text-center font-manrope text-[11px] font-semibold leading-[15px] text-atlas-paper">
              {spec.label}
            </span>
          </Tab>
        ) : (
          <Tab
            key={spec.tab}
            spec={spec}
            isActive={false}
            onSelect={onSelect}
            style={{ left: spec.left }}
            className="absolute top-[28px] flex h-[56px] w-[122px] flex-col items-center justify-center gap-[3px]"
          >
            <AtlasIcon src={spec.idleIcon} size={22} />
            <span className="font-manrope text-[11px] font-medium leading-[15px] text-atlas-beige">{spec.label}</span>
          </Tab>
        )
      )}
    </div>
  );
}

/** Below 390: the same bar built to stretch, with the raised active button ringed in Warm White. */
function CompactBar({ active, onSelect }: { active: AtlasTab; onSelect?: (tab: AtlasTab) => void }) {
  return (
    <div className="relative h-[96px] px-[8px] min-[390px]:hidden">
      <div aria-hidden className="absolute inset-x-[8px] top-[28px] h-[56px] rounded-[12px] bg-atlas-teal shadow-[0px_4px_10px_0px_rgba(28,41,41,0.18)]" />
      <div className="relative flex h-full w-full">
        {TABS.map((spec) =>
          spec.tab === active ? (
            <Tab key={spec.tab} spec={spec} isActive className="relative block h-[84px] min-w-0 flex-1">
              <span className={`absolute left-1/2 top-[-4px] box-content -translate-x-1/2 border-[6px] border-atlas-paper ${RAISED}`}>
                <AtlasIcon src={spec.activeIcon} size={24} />
              </span>
              <span className="absolute inset-x-0 top-[64px] text-center font-manrope text-[11px] font-semibold leading-[15px] text-atlas-paper">
                {spec.label}
              </span>
            </Tab>
          ) : (
            <Tab
              key={spec.tab}
              spec={spec}
              isActive={false}
              onSelect={onSelect}
              className="mt-[28px] flex h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-[3px]"
            >
              <AtlasIcon src={spec.idleIcon} size={22} />
              <span className="font-manrope text-[11px] font-medium leading-[15px] text-atlas-beige">{spec.label}</span>
            </Tab>
          )
        )}
      </div>
    </div>
  );
}

/** Wide layouts: a full-height rail on the left edge. */
function Rail({ active, onSelect }: { active: AtlasTab; onSelect?: (tab: AtlasTab) => void }) {
  return (
    <nav
      aria-label="Atlas sections"
      className="atlas-rail atlas-dark fixed bottom-0 left-0 top-0 z-30 hidden w-[var(--atlas-rail-w)] flex-col items-center gap-[8px] overflow-y-auto bg-atlas-teal pb-[16px] pl-[env(safe-area-inset-left)] pt-[calc(20px+env(safe-area-inset-top))] wide:flex"
    >
      {TABS.map((spec) => {
        const isActive = spec.tab === active;
        return (
          <Tab
            key={spec.tab}
            spec={spec}
            isActive={isActive}
            onSelect={onSelect}
            className={`relative flex h-[68px] w-[72px] shrink-0 flex-col items-center justify-center gap-[4px] rounded-[16px] ${
              isActive ? "bg-atlas-paper/15" : ""
            }`}
          >
            {isActive ? <span aria-hidden className="absolute left-[-8px] top-[14px] h-[40px] w-[3px] rounded-r-[2px] bg-atlas-bronze" /> : null}
            <AtlasIcon src={isActive ? spec.activeIcon : spec.idleIcon} size={22} />
            <span
              className={`font-manrope text-[11px] leading-[15px] ${isActive ? "font-semibold text-atlas-paper" : "font-medium text-atlas-beige"}`}
            >
              {spec.label}
            </span>
          </Tab>
        );
      })}
    </nav>
  );
}

export function AtlasBottomBar({
  active,
  onSelect,
  className = "",
}: {
  active: AtlasTab;
  /** Turns the tabs into buttons that report the tap instead of navigating. */
  onSelect?: (tab: AtlasTab) => void;
  className?: string;
}) {
  return (
    <>
      <nav aria-label="Atlas sections" className={`atlas-dark relative w-full bg-atlas-paper pb-[env(safe-area-inset-bottom)] wide:hidden ${className}`}>
        <DesignBar active={active} onSelect={onSelect} />
        <CompactBar active={active} onSelect={onSelect} />
      </nav>
      <Rail active={active} onSelect={onSelect} />
    </>
  );
}
