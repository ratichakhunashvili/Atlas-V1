import type { ReactNode } from "react";
import { AtlasLogo } from "@/components/atlas-ui/asset";
import { adminLogoutAction } from "@/auth/actions";
import { AdminNav } from "./admin-nav";

/*
 * Admin shell — the 240px Deep Teal sidebar shared by every admin frame from AdminHotels (70:811)
 * to AdminAchievementForm (70:2027): brand, six sections, then the signed-in email and
 * Sign out (ends the session, then admin sign-in) at the bottom.
 *
 * From 1024px it is the sidebar as drawn. Below that the same pieces become a top bar: brand and
 * Sign out on one line, the sections underneath as a row that scrolls on its own, so the page
 * never scrolls sideways.
 */
export function AdminShell({ email, children }: { email: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full flex-col bg-atlas-paper lg:flex-row">
      <aside className="atlas-dark flex shrink-0 flex-wrap items-center gap-x-[12px] gap-y-[4px] bg-atlas-teal px-[12px] pb-[8px] pt-[calc(8px+env(safe-area-inset-top))] lg:sticky lg:top-0 lg:h-dvh lg:w-[240px] lg:overflow-y-auto lg:flex-col lg:flex-nowrap lg:items-stretch lg:gap-[4px] lg:pb-[20px] lg:pt-[24px]">
        <div className="order-1 flex items-center gap-[10px] px-[8px] lg:pb-[16px]">
          <AtlasLogo tone="light" width={32} height={36} />
          <div className="flex flex-col items-start whitespace-nowrap">
            <p className="font-grotesk text-[14px] font-bold leading-[18px] tracking-[2.8px] text-atlas-paper">ATLAS</p>
            <p className="font-manrope text-[12px] leading-[16px] text-atlas-beige">Admin</p>
          </div>
        </div>
        <AdminNav className="order-3 w-full lg:order-2" />
        <div aria-hidden className="hidden lg:order-3 lg:block lg:min-h-px lg:flex-1" />
        <div className="order-2 ml-auto flex items-center gap-[12px] px-[8px] lg:order-4 lg:ml-0 lg:flex-col lg:items-start lg:gap-[2px] lg:py-[12px]">
          <p className="hidden whitespace-nowrap font-manrope text-[12px] leading-[16px] text-atlas-beige sm:block">{email}</p>
          <form action={adminLogoutAction}>
            <button type="submit" className="flex h-[44px] items-center whitespace-nowrap font-manrope text-[14px] font-semibold leading-[19px] text-atlas-paper">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col items-start gap-[20px] px-[16px] pb-[calc(32px+env(safe-area-inset-bottom))] pt-[24px] sm:p-[32px]">
        {children}
      </main>
    </div>
  );
}
