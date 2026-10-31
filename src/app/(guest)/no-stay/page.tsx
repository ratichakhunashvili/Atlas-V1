import type { Metadata } from "next";
import {
  AtlasBackButton,
  AtlasBadge,
  AtlasButton,
  AtlasPoints,
  FlowScreen,
  Spacer,
  type,
} from "@/components/atlas-ui/ui";

/* NoStay · No active stay — Figma frame 1:1225. */

export const metadata: Metadata = { title: "No active stay" };

export default function NoStayPage() {
  return (
    <main>
      <FlowScreen>
        <AtlasBackButton to="SignIn" />
        <div className="flex w-full flex-col items-start gap-[14px] pt-[8px]">
          <AtlasBadge icon="/atlas-ui/icon-home-teal-29.svg" iconSize={29} tone="sand" />
          <p className={type.eyebrow}>Hotel A</p>
          <h1 className={`w-full ${type.title}`}>We can&apos;t find your stay</h1>
          <p className={`w-full ${type.body} text-atlas-ink`}>
            You&apos;re signed in as [guest@email.com], but no stay at Hotel A is linked to this account for today.
          </p>
        </div>
        <section className="flex w-full flex-col items-start gap-[10px]">
          <h2 className={type.heading16}>What you can do</h2>
          <AtlasPoints
            items={[
              { icon: "/atlas-ui/icon-phone.svg", text: "Ask the front desk to link your stay to this email." },
              { icon: "/atlas-ui/icon-mail.svg", text: "Check you used the email you gave the hotel." },
            ]}
          />
        </section>
        <Spacer />
        <div className="flex w-full flex-col items-start gap-[8px]">
          <AtlasButton to="PermLocation">Try again</AtlasButton>
          <AtlasButton to="SignIn" tone="outline">
            Use a different account
          </AtlasButton>
        </div>
      </FlowScreen>
    </main>
  );
}
