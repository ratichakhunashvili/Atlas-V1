import type { Metadata } from "next";
import Link from "next/link";
import { adminLogoutAction } from "@/auth/actions";
import { currentSession } from "@/lib/authorization";
import { AtlasAsset } from "@/components/atlas-ui/asset";
import { AtlasBadge, AtlasButton, AtlasTextLink } from "@/components/atlas-ui/ui";

/*
 * AdminDenied · Access denied — Figma frame 70:800. Where a signed-in account without the admin
 * role lands when it opens the console. "Sign in with a different account" signs out first.
 */

export const metadata: Metadata = { title: "Access denied · Atlas" };

export default async function AdminDeniedPage() {
  // A token whose session was ended counts as signed out: no claim about an account it no longer speaks for.
  const session = await currentSession();
  if (session.status !== "signed-in") return <SignedOutDenied />;
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

/** Someone who is not signed in at all: no claim about their account, just the way in. */
function SignedOutDenied() {
  return (
    <section
      aria-labelledby="admin-denied-title"
      className="flex w-full max-w-[460px] flex-col items-center gap-[14px] rounded-[16px] border border-atlas-beige bg-white p-[24px] text-center sm:p-[32px]"
    >
      <AtlasAsset src="/atlas-ui/logo-teal.png" width={42} height={48} alt="Atlas" />
      <h1 id="admin-denied-title" className="font-grotesk text-[24px] font-bold leading-[31px] text-atlas-teal">
        Admin sign-in needed
      </h1>
      <p className="w-full font-manrope text-[15px] leading-[1.55] text-atlas-slate">
        This area is for Atlas platform admins. Sign in with an admin account to continue.
      </p>
      <Link
        href="/admin/sign-in"
        className="flex min-h-[52px] w-full items-center justify-center rounded-[14px] bg-atlas-teal px-[12px] font-manrope text-[16px] font-semibold leading-[22px] text-atlas-paper"
      >
        Admin sign-in
      </Link>
      <AtlasTextLink to="Main">Back to the Atlas app</AtlasTextLink>
    </section>
  );
}
