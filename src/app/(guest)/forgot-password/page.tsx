import type { Metadata } from "next";
import { AtlasBackButton, AtlasButton, AtlasField, FlowScreen, Spacer, type } from "@/components/atlas-ui/ui";

/* ForgotPassword · Reset password — Figma frame 1:1271. */

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <main>
      <FlowScreen>
        <AtlasBackButton to="SignIn" />
        <div className="flex w-full flex-col items-start gap-[8px]">
          <h1 className={`w-full ${type.title}`}>Reset your password</h1>
          <p className={`w-full ${type.body} text-atlas-slate`}>
            Enter your email and we will send you a link to set a new password.
          </p>
        </div>
        <AtlasField id="reset-email" label="Email" type="email" placeholder="you@example.com" autoComplete="email" />
        <Spacer />
        <AtlasButton to="ForgotSent">Send reset link</AtlasButton>
      </FlowScreen>
    </main>
  );
}
