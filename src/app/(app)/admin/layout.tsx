import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/authorization";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <nav className="flex gap-4 border-b border-slate-200 pb-4 text-sm">
        <Link href="/admin" className="font-medium text-slate-900">
          Admin
        </Link>
        <Link href="/admin/places" className="text-slate-600 hover:text-slate-900">
          Places
        </Link>
        <Link href="/admin/hotels" className="text-slate-600 hover:text-slate-900">
          Hotels
        </Link>
        <Link href="/admin/advisor" className="text-slate-600 hover:text-slate-900">
          Advisor Testing
        </Link>
      </nav>
      {children}
    </div>
  );
}
