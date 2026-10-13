import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/auth/actions";
import { Button } from "@/components/shared/button";
import { requireUser } from "@/lib/authorization";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-lg font-semibold">
            Atlas
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/" className="text-slate-600 hover:text-slate-900">
              Home
            </Link>
            <Link href="/hotels" className="text-slate-600 hover:text-slate-900">
              Hotels
            </Link>
            <Link href="/profile" className="text-slate-600 hover:text-slate-900">
              Profile
            </Link>
            {user.role === "admin" && (
              <Link href="/admin" className="text-slate-600 hover:text-slate-900">
                Admin
              </Link>
            )}
            <span className="text-slate-400">{user.email}</span>
            <form action={logoutAction}>
              <Button variant="secondary" type="submit">
                Log out
              </Button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
