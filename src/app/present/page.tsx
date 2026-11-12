import type { Metadata } from "next";
import { PhoneFrame } from "./phone-frame";

/*
 * Presentation view: the guest app on a phone, centred on a laptop or projector screen, without browser dev tools.
 * The page itself shows nothing private; the app inside the frame signs in and checks access as it always does.
 * `?path=/places/…` opens another screen; only a path on this site is accepted.
 */

export const metadata: Metadata = { title: "Atlas · Presentation" };

function safePath(path: string | string[] | undefined): string {
  const value = Array.isArray(path) ? path[0] : path;
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/present") ? value : "/";
}

export default async function PresentPage({ searchParams }: { searchParams: Promise<{ path?: string | string[] }> }) {
  const { path } = await searchParams;
  return (
    <main className="relative flex h-dvh w-full items-center justify-center overflow-hidden bg-atlas-teal">
      <PhoneFrame src={safePath(path)} />
      <p className="absolute inset-x-0 bottom-[14px] hidden px-[24px] text-center font-manrope text-[14px] leading-[20px] text-atlas-paper/80 sm:block">
        The Atlas guest app, shown at phone size. Tap and scroll it as you would on a phone.
      </p>
    </main>
  );
}
