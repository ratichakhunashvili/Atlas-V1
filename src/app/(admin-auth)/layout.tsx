import type { ReactNode } from "react";

/*
 * AdminSignIn (70:780) and AdminDenied (70:800): one white card centred on Sand, no console
 * navigation. A separate route group from (app)/admin, whose layout requires an admin.
 */
export default function AdminAuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="atlas-app flex min-h-dvh w-full flex-1 items-center justify-center bg-atlas-sand px-[16px] py-[32px]">
      {children}
    </main>
  );
}
