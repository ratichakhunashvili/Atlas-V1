import type { Metadata } from "next";
import { adminLogoutAction } from "@/auth/actions";
import { AtlasBadge, AtlasButton, AtlasTextLink } from "@/components/atlas-ui/ui";

/*
 * AdminDenied · Access denied — Figma frame 70:800. Where a signed-in account without the admin
 * role lands when it opens the console. "Sign in with a different account" signs out first.
 */

export const metadata: Metadata = { title: "Access denied · Atlas" };

export default function AdminDeniedPage() {
  return (
    <section
      aria-labelledby="admin-denied-title"
      className="flex w-full max-w-[460px] flex-col items-center gap-[14px] rounded-[16px] border border-atlas-beige bg-white p-[24px] text-center sm:p-[32px]"
    >
      <AtlasBadge icon="/atlas-ui/icon-lock-teal-29.svg" iconSize={29} tone="sand" />
      <h1 id="admin-denied-title" className="font-grotesk text-[24px] font-bold leading-[31px] text-atlas-teal">
        Access denied
      </h1>
      <p className="w-full font-manrope text-[15px] leading-[1.55] text-atlas-slate">
        {"This account isn't an Atlas platform admin. Ask a platform admin to grant access."}
      </p>
      <form action={adminLogoutAction} className="w-full">
        <AtlasButton type="submit">Sign in with a different account</AtlasButton>
      </form>
      <AtlasTextLink to="Main">Back to the Atlas app</AtlasTextLink>
    </section>
  );
}
