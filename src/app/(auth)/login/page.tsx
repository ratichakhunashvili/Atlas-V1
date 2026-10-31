import type { Metadata } from "next";
import { AtlasAsset, AtlasLogo } from "@/components/atlas-ui/asset";
import { AtlasSignInForm } from "@/components/atlas-ui/sign-in-form";
import { FlowScreen } from "@/components/atlas-ui/ui";

/* SignIn · Sign in / create account — Figma frame 1:722, built on the Auth form set 1:4998. */

export const metadata: Metadata = { title: "Sign in · Atlas" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  return (
    <main>
      <FlowScreen className="overflow-hidden">
        <AtlasAsset
          src="/atlas-ui/pattern-teal-wave.svg"
          width={390}
          height={139}
          className="pointer-events-none absolute left-0 top-[calc(64px+env(safe-area-inset-top))] max-w-none opacity-12"
        />
        <div className="relative flex w-full items-center justify-end">
          <AtlasLogo tone="teal" width={38} height={44} />
        </div>
        <div className="relative flex w-full flex-1 flex-col">
          <AtlasSignInForm callbackUrl={callbackUrl} />
        </div>
      </FlowScreen>
    </main>
  );
}
