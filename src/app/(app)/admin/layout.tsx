import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/authorization";

type NavLink = { href: string; label: string };

/** Related work is grouped, per the console's information architecture; the groups wrap on narrow screens. */
const NAV_GROUPS: Array<{ label: string; links: NavLink[] }> = [
  { label: "Overview", links: [{ href: "/admin", label: "Dashboard" }] },
  {
    label: "Hotels",
    links: [{ href: "/admin/hotels", label: "Hotels, facilities, events & QR" }],
  },
  { label: "Places", links: [{ href: "/admin/places", label: "Places" }] },
  { label: "Partnerships", links: [{ href: "/admin/partners", label: "Partners" }] },
  {
    label: "Experiences",
    links: [
      { href: "/admin/attractions", label: "Attractions" },
      { href: "/admin/achievements", label: "Achievements" },
      { href: "/admin/models", label: "3D models" },
      { href: "/admin/ar-targets", label: "Camera refs" },
    ],
  },
  {
    label: "Guest activity",
    links: [
      { href: "/admin/analytics", label: "Analytics" },
      { href: "/admin/support", label: "Guest support" },
    ],
  },
  {
    label: "Settings",
    links: [
      { href: "/admin/staff", label: "Staff access" },
      { href: "/admin/audit", label: "Audit log" },
      { href: "/admin/advisor", label: "Advisor testing" },
    ],
  },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <div className="space-y-6 pb-24">
      <nav aria-label="Admin sections" className="grid gap-x-8 gap-y-3 border-b border-slate-200 pb-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group.label}</p>
            <ul className="mt-1 space-y-0.5">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="inline-flex min-h-9 items-center text-slate-700 hover:text-slate-900 hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {children}
    </div>
  );
}
