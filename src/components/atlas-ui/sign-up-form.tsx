"use client";

import { useActionState } from "react";
import { signupAction, type SignUpState } from "@/features/users/actions";
import { ErrorBanner } from "./sign-in-form";
import { AtlasButton, AtlasField, AtlasLink, Spacer, type } from "./ui";

/*
 * Create account — Figma SignUp (70:3586), with the error states SignUpEmailUsed (70:3615) and
 * SignUpWeak (70:3654) driven by what signupAction returns. On success the guest is signed in and
 * taken into the app.
 */

const PASSWORD_HINT = "At least 8 characters, with a letter and a number.";
const LINK = "flex h-[44px] items-center font-manrope text-[14px] font-semibold leading-[19px] text-atlas-teal";

export function AtlasSignUpForm() {
  const [state, action, pending] = useActionState<SignUpState, FormData>(signupAction, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex w-full min-h-0 flex-1 flex-col items-start gap-[16px]">
      <div className="flex w-full flex-col items-start gap-[8px]">
        <h1 className={`w-full ${type.title}`}>Create your account</h1>
        <p className={`w-full ${type.body} text-atlas-slate`}>Your account keeps your plan and achievements for this stay.</p>
      </div>

      {state.emailUsed ? <ErrorBanner>An account with this email already exists.</ErrorBanner> : null}

      <div className="flex w-full flex-col items-start gap-[16px]">
        <AtlasField
          id="name"
          label="Your name"
          placeholder="First name"
          autoComplete="given-name"
          defaultValue={state.values?.name}
          error={errors.name}
        />
        <AtlasField
          id="email"
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          defaultValue={state.values?.email}
          error={errors.email}
          required
        />
        <AtlasField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          hint={PASSWORD_HINT}
          error={errors.password}
          required
        />
        {state.emailUsed ? (
          <div className="flex w-full flex-wrap items-center gap-x-[16px]">
            <AtlasLink to="SignIn" className={LINK}>
              Sign in instead
            </AtlasLink>
          </div>
        ) : null}
      </div>

      <Spacer />

      <div className="flex w-full flex-col items-start gap-[10px]">
        <AtlasButton type="submit" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </AtlasButton>
        <p className="w-full text-center font-manrope text-[12px] leading-[1.5] text-atlas-slate">
          By continuing you agree to Atlas&apos;s Terms and Privacy notice.
        </p>
      </div>
    </form>
  );
}
