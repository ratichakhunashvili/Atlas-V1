"use client";

import { useRouter } from "next/navigation";
import { AtlasDialog } from "@/components/atlas-ui/dialog";
import { SCREEN_HREFS } from "@/components/atlas-ui/screen-hrefs";
import { AtlasLink } from "@/components/atlas-ui/ui";

/*
 * AdminQRRevoke's dialog (70:1912) over the QR codes list. It opens with the page; Keep code,
 * Revoke code, Escape and a click on the dimmed backdrop all return to AdminQR, as in the
 * prototype. Nothing is revoked.
 */
export function QrRevokeDialog({ label }: { label: string }) {
  const router = useRouter();
  const button =
    "flex h-[48px] min-w-0 flex-1 items-center justify-center rounded-[12px] px-[12px] text-center font-manrope text-[15px] font-semibold leading-[20px]";
  return (
    <AtlasDialog open onClose={() => router.push(SCREEN_HREFS.AdminQR)} labelledBy="qr-revoke-title" describedBy="qr-revoke-body">
      <h2 id="qr-revoke-title" className="font-grotesk text-[20px] font-bold leading-[26px] text-atlas-ink">
        Revoke this code?
      </h2>
      <p id="qr-revoke-body" className="w-full font-manrope text-[14px] leading-[1.55] text-atlas-ink">
        {`Guests will no longer be able to use "${label}". This can't be undone.`}
      </p>
      <div className="flex w-full gap-[10px]">
        <AtlasLink to="AdminQR" className={`${button} border border-atlas-teal text-atlas-teal`}>
          Keep code
        </AtlasLink>
        <AtlasLink to="AdminQR" className={`${button} bg-atlas-danger text-white`}>
          Revoke code
        </AtlasLink>
      </div>
    </AtlasDialog>
  );
}
