"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SCREEN_HREFS } from "@/components/atlas-ui/screen-hrefs";

/*
 * Sidebar navigation. The only client code in the shell: it reads the path to mark the current
 * section (aria-current="page"), so pages never pass it in. Each form belongs to its list's
 * section, for example /admin/hotels/edit to Hotels.
 */

const ITEMS: readonly { href: string; label: string; section: string }[] = [
  { href: SCREEN_HREFS.AdminHotels, label: "Hotels", section: "/admin/hotels" },
  { href: SCREEN_HREFS.AdminPlaces, label: "Places", section: SCREEN_HREFS.AdminPlaces },
  { href: SCREEN_HREFS.AdminPartnerships, label: "Hotel partners", section: SCREEN_HREFS.AdminPartnerships },
  { href: SCREEN_HREFS.AdminFacilities, label: "Facilities", section: SCREEN_HREFS.AdminFacilities },
  { href: SCREEN_HREFS.AdminQR, label: "QR codes", section: SCREEN_HREFS.AdminQR },
  { href: SCREEN_HREFS.AdminAchievements, label: "Achievements", section: SCREEN_HREFS.AdminAchievements },
];

function isCurrent(pathname: string, item: (typeof ITEMS)[number]) {
  // The hotels list is the admin home at /admin itself, so it cannot be a plain prefix match.
  if (pathname === item.href) return true;
  return pathname === item.section || pathname.startsWith(`${item.section}/`);
}

export function AdminNav({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className={className}>
      {/* The vertical padding keeps focus outlines visible inside the sideways-scrolling row. */}
      <ul className="flex gap-[4px] overflow-x-auto px-[6px] py-[6px] lg:flex-col lg:overflow-visible lg:p-0">
        {ITEMS.map((item) => {
          const current = isCurrent(pathname, item);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`flex h-[44px] items-center whitespace-nowrap rounded-[10px] px-[12px] font-manrope text-[14px] leading-[19px] ${
                  current ? "bg-atlas-paper/14 font-semibold text-atlas-paper" : "font-medium text-atlas-beige"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
