import type { Metadata } from "next";
import { CameraLayout, CloseButton, ViewfinderCorners } from "@/components/atlas-ui/scan-screens";
import { AtlasButton, AtlasLink } from "@/components/atlas-ui/ui";

/*
 * ScanHotel · Scan the hotel code — Figma frame 70:3730.
 *
 * Built on the Scan tab's camera layout. As there, the camera area is a placeholder: tapping
 * the viewfinder simulates a good scan and continues to StayConfirmed, as the prototype does.
 */

export const metadata: Metadata = { title: "Scan the hotel code" };

function Heading() {
  return (
    <>
      <p className="font-grotesk text-[11px] font-medium uppercase leading-[14px] tracking-[0.88px] text-atlas-beige">Join your hotel</p>
      <h1 className="font-grotesk text-[22px] font-bold leading-[28px] text-atlas-paper">Scan the hotel&apos;s Atlas code</h1>
      <p className="w-full text-center font-manrope text-[14px] leading-[19px] text-atlas-fog">
        Find it on the card at reception or in your room.
      </p>
    </>
  );
}

export default function ScanHotelPage() {
  return (
    <CameraLayout
      label="[Camera placeholder] Tap the frame to simulate a scan"
      labelTop={520}
      camera={
        <>
          <CloseButton to="NoStay" />
          <div className="relative flex flex-col items-center gap-[4px] px-[24px] pb-[52px] pt-[calc(76px+env(safe-area-inset-top))] wide:h-full wide:justify-center wide:pb-[52px] wide:pt-[76px]">
            <div className="flex w-full flex-col items-center gap-[6px] text-center wide:hidden">
              <Heading />
            </div>
            <AtlasLink
              to="StayConfirmed"
              label="Simulate a good scan of the hotel code"
              className="relative mt-[43px] block size-[min(240px,calc(100vw_-_32px))] shrink-0 short:size-[min(200px,calc(100vw_-_32px))] wide:mt-0"
            >
              <ViewfinderCorners />
            </AtlasLink>
          </div>
        </>
      }
      panel={
        <>
          <div className="hidden flex-col items-center gap-[6px] bg-atlas-teal px-[24px] py-[20px] text-center wide:flex">
            <Heading />
          </div>
          <section className="flex w-full flex-col items-start gap-[12px] rounded-t-[24px] bg-atlas-paper px-[16px] pb-[calc(28px+env(safe-area-inset-bottom))] pt-[20px] wide:rounded-none">
            <h2 className="font-grotesk text-[17px] font-bold leading-[22px] text-atlas-teal">Can&apos;t scan the code?</h2>
            <p className="w-full font-manrope text-[14px] leading-[1.55] text-atlas-slate">
              Ask the front desk to confirm your stay, or try the code again.
            </p>
            <AtlasButton to="QRInvalid" tone="outline">
              Code not working?
            </AtlasButton>
            <p className="w-full text-center font-manrope text-[12px] leading-[1.5] text-atlas-slate">
              Prototype: the camera isn&apos;t opened. Nothing is saved or sent.
            </p>
          </section>
        </>
      }
    />
  );
}
