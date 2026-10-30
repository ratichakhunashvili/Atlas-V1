import type { Metadata } from "next";
import { DemoAction, FRONT_DESK_NOTICE } from "@/components/atlas-ui/navigation";
import { AtlasBadge, AtlasButton, FlowScreen, Spacer, type } from "@/components/atlas-ui/ui";

/* QRInvalid · Hotel code not recognised — Figma frame 1:1254. */

export const metadata: Metadata = { title: "Code can't be used" };

export default function QrInvalidPage() {
  return (
    <main>
      <FlowScreen>
        <div className="flex w-full flex-col items-start gap-[14px] pt-[48px]">
          <AtlasBadge icon="/atlas-ui/icon-qr-teal.svg" iconSize={29} tone="sand" />
          <h1 className={`w-full ${type.title}`}>This code can&apos;t be used</h1>
          <p className={`w-full ${type.body} text-atlas-ink`}>
            It may be out of date, damaged, or not an Atlas hotel code.
          </p>
          <p className={`w-full ${type.body} text-atlas-slate`}>
            Ask the front desk for the hotel&apos;s current Atlas card, or type the short link printed under the code.
          </p>
        </div>
        <Spacer />
        <div className="flex w-full flex-col items-start gap-[8px]">
          <AtlasButton to="Welcome" icon="/atlas-ui/icon-qr-light-19.svg">
            Scan again
          </AtlasButton>
          <DemoAction
            className="flex h-[44px] w-full items-center justify-center font-manrope text-[15px] font-semibold leading-[20px] text-atlas-teal"
            notice={FRONT_DESK_NOTICE}
          >
            Call the front desk
          </DemoAction>
        </div>
      </FlowScreen>
    </main>
  );
}
