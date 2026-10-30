import type { Metadata } from "next";
import {
  AtlasBusyButton,
  AtlasConfirmationToast,
  AtlasErrorCard,
  AtlasFieldWithError,
  AtlasLocationOffBanner,
  AtlasOfflineBanner,
  AtlasSkeletonCard,
  AtlasUndoToast,
} from "@/components/atlas-ui/states";
import { screenHref } from "@/components/atlas-ui/screens";

/*
 * StatesKit · Shared states — Figma frame 1:1491.
 *
 * A gallery of the states reused across the app, in the same order and with the same copy
 * as the design, rendered with the real components from src/components/atlas-ui/states.tsx.
 */

/* Line heights come from the Figma text node heights, so the stack of states lines up exactly. */
const CAPTION = "font-grotesk text-[12px] uppercase leading-[15px] tracking-[0.72px] text-atlas-slate";

export const metadata: Metadata = { title: "Shared states" };

export default function AtlasUiStatesPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-start gap-[12px] bg-atlas-paper px-[16px] py-[20px]">
      <h1 className="w-full font-grotesk text-[24px] font-bold leading-[28px] text-atlas-teal">Shared states</h1>
      <p className="w-full font-manrope text-[14px] leading-[22px] text-atlas-slate">
        Reused across screens. Each appears in place of, or on top of, the normal content.
      </p>

      <p className={CAPTION}>Location off · top of Explore</p>
      <AtlasLocationOffBanner
        message="Location is off. Walk times are from Hotel A, and check-in needs a code."
        actionLabel="Turn on location"
        actionHref={screenHref("PermLocation") ?? undefined}
      />

      <p className={CAPTION}>Offline · any screen</p>
      <AtlasOfflineBanner message="You're offline. Your saved plan still works; new places need a connection." />

      <p className={CAPTION}>Loading · list and sheet</p>
      <AtlasSkeletonCard />

      <p className={CAPTION}>Could not load</p>
      <AtlasErrorCard
        title="Couldn't load places"
        body="Check your connection and try again."
        actionLabel="Try again"
      />

      <p className={CAPTION}>Undo toast · after remove or replace</p>
      <AtlasUndoToast message="Stop 3 removed from your plan" actionLabel="Undo" />

      <p className={CAPTION}>Confirmation toast</p>
      <AtlasConfirmationToast message="Added to today's plan" />

      <p className={CAPTION}>Button while working</p>
      <AtlasBusyButton label="Checking in…" />

      <p className={CAPTION}>Field error</p>
      <AtlasFieldWithError
        id="states-email"
        label="Email"
        type="email"
        defaultValue="guest@"
        error="Enter a full email address, like name@example.com."
      />
    </div>
  );
}
