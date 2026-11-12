"use client";

import { useActionState } from "react";
import { ErrorBanner } from "@/components/atlas-ui/sign-in-form";
import {
  AtlasBackButton,
  AtlasBadge,
  AtlasButton,
  AtlasField,
  AtlasTextLink,
  FlowScreen,
  Spacer,
  type,
} from "@/components/atlas-ui/ui";
import { requestResetAction, type RequestResetState } from "./actions";

/* ForgotPassword (1:1271) and the "check your email" result (1:1286), shown in place once the request is made. */

export function RecoveryUnavailable() {
  return (
    <main>
      <FlowScreen gap={20}>
        <AtlasBackButton to="SignIn" />
        <div className="flex w-full flex-col items-start gap-[14px] pt-[24px]">
          <AtlasBadge icon="/atlas-ui/icon-clock-teal-29.svg" iconSize={29} tone="sand" />
          <h1 className={`w-full ${type.title}`}>Password recovery isn&apos;t available yet</h1>
          <p className={`w-full ${type.body} text-atlas-slate`}>
            We can&apos;t email reset links right now. Please contact Atlas support and we will help you get back in.
          </p>
        </div>
        <Spacer />
        <AtlasButton to="SignIn">Back to sign in</AtlasButton>
      </FlowScreen>
    </main>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<RequestResetState, FormData>(requestResetAction, { status: "idle" });

  if (state.status === "unavailable") return <RecoveryUnavailable />;

  if (state.status === "sent") {
    return (
      <main>
        <FlowScreen gap={20}>
          <AtlasBackButton to="SignIn" />
          <div className="flex w-full flex-col items-start gap-[14px] pt-[24px]" role="status">
            <AtlasBadge icon="/atlas-ui/icon-mail-light.svg" iconSize={29} />
            <h1 className={`w-full ${type.title}`}>Check your email</h1>
            <p className={`w-full ${type.body} text-atlas-slate`}>
              {state.message} It works for 30 minutes and can be used once.
            </p>
          </div>
          <Spacer />
          <AtlasButton to="SignIn">Back to sign in</AtlasButton>
        </FlowScreen>
      </main>
    );
  }

  return (
    <main>
      <FlowScreen>
        <AtlasBackButton to="SignIn" />
        <form action={action} className="flex w-full min-h-0 flex-1 flex-col items-start gap-[16px]">
          <div className="flex w-full flex-col items-start gap-[8px]">
            <h1 className={`w-full ${type.title}`}>Reset your password</h1>
            <p className={`w-full ${type.body} text-atlas-slate`}>
              Enter your email and we will send you a link to set a new password.
            </p>
          </div>
          {state.status === "error" && state.message ? <ErrorBanner>{state.message}</ErrorBanner> : null}
          <AtlasField
            id="email"
            label="Email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            defaultValue={state.email}
            required
          />
          <Spacer />
          <div className="flex w-full flex-col items-start gap-[6px]">
            <AtlasButton type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send reset link"}
            </AtlasButton>
            <AtlasTextLink to="SignIn">Back to sign in</AtlasTextLink>
          </div>
        </form>
      </FlowScreen>
    </main>
  );
}
