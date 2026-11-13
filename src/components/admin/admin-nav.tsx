"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SCREEN_HREFS } from "@/components/atlas-ui/screen-hrefs";

/*
 * Sidebar navigation. The only client code in the shell: it reads the path to mark the current
 * section (aria-current="page"), so pages never pass it in. Each form belongs to its list's
 * section, for example /admin/hotels/[id] to Hotels.
 *
 * Grouped on wide screens; below 1024px the same links run as one row that scrolls on its own.
 */

type NavItem = { href: string; label: string; section: string; devOnly?: boolean };

const GROUPS: readonly { label: string; items: readonly NavItem[] }[] = [
  {
    label: "Catalogue",
    items: [
      // Hotel pages live under /admin/hotels/…, while the list itself is the admin home.
      { href: SCREEN_HREFS.AdminHotels, label: "Hotels", section: "/admin/hotels" },
      { href: SCREEN_HREFS.AdminPlaces, label: "Places", section: SCREEN_HREFS.AdminPlaces },
      { href: "/admin/contracts", label: "Atlas contracts", section: "/admin/contracts" },
      { href: SCREEN_HREFS.AdminPartnerships, label: "Promotion", section: SCREEN_HREFS.AdminPartnerships },
      { href: SCREEN_HREFS.AdminFacilities, label: "Hotel facilities", section: SCREEN_HREFS.AdminFacilities },
      { href: "/admin/attractions", label: "Guest reach", section: "/admin/attractions" },
    ],
  },
  {
    label: "Guest experience",
    items: [
      { href: SCREEN_HREFS.AdminQR, label: "QR codes", section: SCREEN_HREFS.AdminQR },
      { href: SCREEN_HREFS.AdminAchievements, label: "Achievements", section: SCREEN_HREFS.AdminAchievements },
      { href: "/admin/models", label: "3D models", section: "/admin/models" },
      { href: "/admin/ar-targets", label: "Camera references", section: "/admin/ar-targets" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/support", label: "Guest support", section: "/admin/support" },
      { href: "/admin/feedback", label: "Guest feedback", section: "/admin/feedback" },
      { href: "/admin/staff", label: "Staff access", section: "/admin/staff" },
      { href: "/admin/analytics", label: "Analytics", section: "/admin/analytics" },
      { href: "/admin/audit", label: "Audit log", section: "/admin/audit" },
      { href: "/admin/advisor", label: "Advisor testing", section: "/admin/advisor", devOnly: true },
    ],
  },
];

function isCurrent(pathname: string, item: NavItem) {
  // The hotels list is the admin home at /admin itself, so it cannot be a plain prefix match.
  if (pathname === item.href) return true;
  return pathname === item.section || pathname.startsWith(`${item.section}/`);
}

export function AdminNav({ className = "", showDevTools = false }: { className?: string; showDevTools?: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className={className}>
      {/* The vertical padding keeps focus outlines visible inside the sideways-scrolling row. */}
      <div className="flex gap-[4px] overflow-x-auto px-[6px] py-[6px] [scrollbar-width:thin] lg:flex-col lg:gap-[14px] lg:overflow-visible lg:p-0">
        {GROUPS.map((group) => (
          <div key={group.label} className="contents lg:block">
            <p className="hidden px-[12px] pb-[4px] font-manrope text-[11px] font-semibold uppercase leading-[16px] tracking-[0.9px] text-atlas-beige/70 lg:block">
              {group.label}
            </p>
            <ul className="contents lg:flex lg:flex-col lg:gap-[2px]">
              {group.items
                .filter((item) => showDevTools || !item.devOnly)
                .map((item) => {
                  const current = isCurrent(pathname, item);
                  return (
                    <li key={item.href} className="shrink-0">
                      <Link
                        href={item.href}
                        aria-current={current ? "page" : undefined}
                        className={`flex h-[44px] items-center lg:h-[36px] whitespace-nowrap rounded-[10px] px-[12px] font-manrope text-[14px] leading-[19px] ${
                          current ? "bg-atlas-paper/14 font-semibold text-atlas-paper" : "font-medium text-atlas-beige hover:text-atlas-paper"
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
