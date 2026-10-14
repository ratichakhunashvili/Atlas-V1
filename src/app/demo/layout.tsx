import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "Atlas demo",
  description: "Atlas guest-flow prototype using local demo fixtures.",
};

export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    // Explicit light palette: globals.css switches body text to near-white under prefers-color-scheme: dark,
    // which would make dark-on-white cards unreadable here. The demo is a light-only prototype for now.
    <div className="flex flex-1 flex-col bg-slate-50 text-slate-900">
      <div className="bg-amber-100 px-4 py-2 text-center text-xs text-amber-900">
        Prototype · demo fixtures only — not real hotels, partners or bookings
      </div>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
          <Link href="/demo" className="text-lg font-semibold">
            Atlas
          </Link>
          <span className="text-xs text-slate-500">Guest demo</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
