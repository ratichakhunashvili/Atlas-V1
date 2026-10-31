"use client";

import { useActionState } from "react";
import { loginAction, type SignInState } from "@/auth/actions";
import { AtlasIcon } from "./asset";
import { AtlasButton, AtlasField, AtlasLink, Spacer, type } from "./ui";

/*
 * SignIn · Sign in / create account — Figma frame 1:722, "Sign in" variant of the Auth form set
 * (1:4999). The mode switch's "Create account" half opens the SignUp screen (70:3586).
 *
 * Posts to loginAction; a wrong email or password comes back as form state and is announced.
 */

const TAB = "flex h-[44px] min-w-0 flex-1 items-center justify-center font-manrope text-[14px] font-semibold leading-[19px]";

export function ErrorBanner({ children }: { children: string }) {
  return (
    <div
      role="alert"
      className="flex w-full items-start gap-[10px] rounded-[12px] border border-atlas-danger bg-atlas-danger-soft px-[14px] py-[12px]"
    >
      <AtlasIcon src="/atlas-ui/icon-info-danger-18.svg" size={18} className="mt-px shrink-0" />
      <p className="min-w-0 flex-1 font-manrope text-[14px] leading-[1.45] text-atlas-danger">{children}</p>
    </div>
  );
}

export function AtlasSignInForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(loginAction, {});

  return (
    <form action={action} className="flex w-full min-h-0 flex-1 flex-col items-start gap-[16px]">
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
      <div className="flex w-full flex-col items-start gap-[8px]">
        <h1 className={`w-full ${type.title}`}>Welcome back</h1>
        <p className={`w-full ${type.body} text-atlas-slate`}>
          Your account keeps your plan and achievements for this stay.
        </p>
      </div>

      <nav aria-label="Sign in or create an account" className="flex w-full overflow-hidden rounded-[12px] border border-atlas-beige">
        <span aria-current="page" className={`${TAB} bg-atlas-teal text-atlas-paper`}>
          Sign in
        </span>
        <AtlasLink to="SignUp" className={`${TAB} bg-atlas-paper text-atlas-teal`}>
          Create account
        </AtlasLink>
      </nav>

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}

      <div className="flex w-full flex-col items-start gap-[16px]">
        <AtlasField
          id="email"
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          defaultValue={state.email}
          required
        />
        <AtlasField id="password" label="Password" type="password" autoComplete="current-password" required />
      </div>

      <Spacer />

      <div className="flex w-full flex-col items-start gap-[10px]">
        <AtlasButton type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </AtlasButton>
        <p className="w-full text-center font-manrope text-[12px] leading-[1.5] text-atlas-slate">
          By continuing you agree to Atlas&apos;s Terms and Privacy notice.
        </p>
      </div>
    </form>
  );
}
