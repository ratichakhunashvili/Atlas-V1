"use client";

import { useActionState } from "react";
import { AtlasLogo } from "@/components/atlas-ui/asset";
import { ConfirmationScreen } from "@/components/atlas-ui/confirmation-screen";
import { ErrorBanner } from "@/components/atlas-ui/sign-in-form";
import { AtlasButton, AtlasField, AtlasTextLink, FlowScreen, Spacer, type } from "@/components/atlas-ui/ui";
import { resetPasswordAction, type ResetPasswordState } from "./actions";

/* ResetPassword (70:3683). "Password changed" (70:3705) appears only after the server confirms the change. */

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ResetPasswordState, FormData>(resetPasswordAction, { status: "idle" });

  if (state.status === "done") {
    return (
      <ConfirmationScreen
        patternClassName="top-[calc(40px+env(safe-area-inset-top))] opacity-40"
        actions={<AtlasButton to="SignIn">Sign in</AtlasButton>}
      >
        <h1 className="w-full font-grotesk text-[26px] font-bold leading-[30px] text-atlas-teal" role="status">
          Password changed
        </h1>
        <p className={`w-full ${type.body} text-atlas-slate`}>You can now sign in with your new password.</p>
      </ConfirmationScreen>
    );
  }

  const errors = state.fieldErrors ?? {};
  return (
    <main>
      <FlowScreen>
        <AtlasLogo tone="teal" width={39} height={44} />
        <form action={action} className="flex w-full min-h-0 flex-1 flex-col items-start gap-[16px]">
          <input type="hidden" name="token" value={token} />
          <div className="flex w-full flex-col items-start gap-[8px] pt-[8px]">
            <h1 className={`w-full ${type.title}`}>Set a new password</h1>
            <p className={`w-full ${type.body} text-atlas-slate`}>Choose a password you haven&apos;t used for Atlas before.</p>
          </div>
          {state.formError ? <ErrorBanner>{state.formError}</ErrorBanner> : null}
          <div className="flex w-full flex-col items-start gap-[16px]">
            <AtlasField
              id="password"
              label="New password"
              type="password"
              autoComplete="new-password"
              hint="At least 8 characters, with a letter and a number."
              error={errors.password}
              required
            />
            <AtlasField
              id="confirm"
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              error={errors.confirm}
              required
            />
          </div>
          <Spacer />
          <div className="flex w-full flex-col items-start gap-[6px]">
            <AtlasButton type="submit" disabled={pending}>
              {pending ? "Changing…" : "Change password"}
            </AtlasButton>
            <AtlasTextLink to="SignIn">Cancel</AtlasTextLink>
          </div>
        </form>
      </FlowScreen>
    </main>
  );
}
