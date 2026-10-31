"use client";

import { useState } from "react";
import { AtlasIcon } from "@/components/atlas-ui/asset";

/*
 * The three buttons on AdminQRCreated (70:1783). The design gives them no prototype links, so
 * each does only what is honest here:
 *   Print — prints the page with the browser's own dialog.
 *   Copy link — copies the link exactly as shown and says so.
 *   Download PNG — there is no real code to export, so it is shown but marked unavailable.
 */

const BUTTON =
  "flex h-[48px] min-w-0 flex-[1_1_160px] items-center justify-center gap-[8px] rounded-[12px] border border-atlas-teal px-[16px] font-manrope text-[14px] font-semibold leading-[19px] text-atlas-teal";

export function QrCodeActions({ link }: { link: string }) {
  const [status, setStatus] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setStatus("Link copied.");
    } catch {
      setStatus("Couldn't copy the link. Select it above and copy it instead.");
    }
  }

  return (
    <div className="flex w-full flex-col gap-[8px]">
      <div className="flex w-full flex-wrap gap-[10px]">
        <button type="button" aria-disabled="true" aria-describedby="qr-download-note" className={`${BUTTON} cursor-not-allowed`}>
          <AtlasIcon src="/atlas-ui/icon-download-teal-18.svg" size={18} className="shrink-0" />
          <span className="whitespace-nowrap">Download PNG</span>
        </button>
        <button type="button" onClick={() => window.print()} className={BUTTON}>
          <AtlasIcon src="/atlas-ui/icon-print-teal-18.svg" size={18} className="shrink-0" />
          <span className="whitespace-nowrap">Print</span>
        </button>
        <button type="button" onClick={copy} className={BUTTON}>
          <AtlasIcon src="/atlas-ui/icon-copy-teal-18.svg" size={18} className="shrink-0" />
          <span className="whitespace-nowrap">Copy link</span>
        </button>
      </div>
      <span id="qr-download-note" className="sr-only">
        Not available in the prototype: there is no real code to download.
      </span>
      {/* Always rendered, so screen readers already know the live region when the message arrives. */}
      <p role="status" className={`font-manrope text-[13px] leading-[18px] text-atlas-slate ${status ? "" : "sr-only"}`}>
        {status}
      </p>
    </div>
  );
}
