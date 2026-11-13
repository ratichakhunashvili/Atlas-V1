import type { Metadata } from "next";
import { AtlasLogo } from "@/components/atlas-ui/asset";
import { PhoneFrame } from "../present/phone-frame";

/*
 * Presentation preview: the real guest app inside a phone, on the brand palette (docs/atlas-brand-book.md): Warm Beige
 * #d7c4b1 background, Deep Teal #0a4a4f type, a Muted Bronze #a58d66 rule. Like /present, the page shows nothing
 * private; the app in the frame signs in and checks access as it always does. `?path=/…` opens another screen of this
 * site in the phone.
 */

export const metadata: Metadata = { title: "Atlas · Preview" };

function safePath(path: string | string[] | undefined): string {
  const value = Array.isArray(path) ? path[0] : path;
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/preview") && !value.startsWith("/present")
    ? value
    : "/";
}

export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ path?: string | string[] }> }) {
  const { path } = await searchParams;
  return (
    <main className="relative flex h-dvh w-full items-center justify-center gap-[72px] overflow-hidden bg-atlas-beige">
      <section className="hidden max-w-[360px] flex-col items-start gap-[18px] lg:flex">
        <AtlasLogo tone="teal" width={72} height={83} />
        <p className="font-grotesk text-[22px] font-bold leading-[28px] tracking-[5px] text-atlas-teal">ATLAS</p>
        <span aria-hidden className="h-[2px] w-[56px] bg-atlas-bronze" />
        <h1 className="font-grotesk text-[34px] font-bold leading-[1.12] text-atlas-teal">
          Tell us when you&apos;re free. We&apos;ll figure out what you can do.
        </h1>
        <p className="font-manrope text-[16px] leading-[1.55] text-atlas-ink">
          Atlas turns a hotel stay into a plan: the hotel&apos;s own facilities, nearby attractions and partner places, on one map.
        </p>
      </section>
      <PhoneFrame src={safePath(path)} />
    </main>
  );
}
