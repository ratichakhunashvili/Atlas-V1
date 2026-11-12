import Link from "next/link";
import { AtlasAsset } from "@/components/atlas-ui/asset";

/*
 * The one 404 page: unknown URLs and the blocked design-preview paths (the proxy rewrites those here, so a
 * blocked page is indistinguishable from a page that does not exist).
 */
export default function NotFound() {
  return (
    <main className="atlas-app flex min-h-dvh w-full flex-1 flex-col items-center justify-center gap-[14px] bg-atlas-sand px-[24px] py-[32px] text-center">
      <AtlasAsset src="/atlas-ui/logo-teal.png" width={42} height={48} alt="Atlas" />
      <h1 className="font-grotesk text-[24px] font-bold leading-[31px] text-atlas-teal">Page not found</h1>
      <p className="max-w-[320px] font-manrope text-[15px] leading-[1.55] text-atlas-slate">
        We couldn’t find that page. It may have moved, or the link may be wrong.
      </p>
      <Link
        href="/"
        className="flex min-h-[52px] w-full max-w-[320px] items-center justify-center rounded-[14px] bg-atlas-teal px-[12px] font-manrope text-[16px] font-semibold leading-[22px] text-atlas-paper"
      >
        Back to Atlas
      </Link>
    </main>
  );
}
