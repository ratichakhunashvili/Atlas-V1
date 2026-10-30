import type { Metadata } from "next";
import { AtlasLogo } from "@/components/atlas-ui/asset";
import { AtlasBadge, AtlasButton, FlowScreen, type } from "@/components/atlas-ui/ui";

/*
 * AccountDeleted · Account deleted — Figma frame 70:4125. Shown after deleting the account from
 * Help and privacy. The prototype has no accounts; deleting there resets this browser's demo data.
 */

export const metadata: Metadata = { title: "Account deleted" };

export default function AccountDeletedPage() {
  return (
    <main>
      <FlowScreen gap={16}>
        <div className="flex w-full items-center">
          <AtlasLogo tone="teal" width={39} height={44} />
        </div>
        <div role="status" className="flex min-h-px w-full flex-1 flex-col items-center justify-center gap-[14px]">
          <AtlasBadge icon="/atlas-ui/icon-check-teal-32.svg" iconSize={32} size={72} tone="sand" />
          <h1 className={`w-full text-center ${type.title}`}>Your account has been deleted</h1>
          <p className={`w-full text-center ${type.body} text-atlas-slate`}>
            Your plans, achievements and preferences have been removed. You can create a new account any time.
          </p>
        </div>
        <p className={`w-full text-center ${type.caption}`}>
          Prototype: there are no accounts. Deleting reset the demo plan and achievements kept in this browser.
        </p>
        <AtlasButton to="Welcome">Back to welcome</AtlasButton>
      </FlowScreen>
    </main>
  );
}
