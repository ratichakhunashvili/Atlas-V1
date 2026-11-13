"use client";

import { useActionState } from "react";
import { callbackQuery, hasProtectedCallback } from "@/auth/callback";
import { signupAction, type SignUpState } from "@/features/users/actions";
import { ConsentLine, useAuthForm } from "./auth-parts";
import { GoogleSignInButton } from "./google-sign-in";
import { ErrorBanner } from "./sign-in-form";
import { AtlasButton, AtlasField, AtlasLink, Spacer, type } from "./ui";

/*
 * Create account — Figma SignUp (70:3586), with the error states SignUpEmailUsed (70:3615) and
 * SignUpWeak (70:3654) driven by what signupAction returns. On success the guest is signed in and
 * taken into the app. Browser validation bubbles are off (noValidate): every message is the server's,
 * shown inline, announced, and focus moves to the first field with a problem.
 */

const PASSWORD_HINT = "At least 8 characters, with a letter and a number.";
const LINK =
  "flex min-h-[44px] items-center font-manrope text-[14px] font-semibold leading-[19px] text-atlas-teal underline underline-offset-2";

/** `google`: show "Continue with Google" (the page renders its form, GoogleSignInForm). */
export function AtlasSignUpForm({ callbackUrl, google = false }: { callbackUrl?: string; google?: boolean }) {
  const [state, action, pending] = useActionState<SignUpState, FormData>(signupAction, {});
  const errors = state.fieldErrors ?? {};
  const failed = Boolean(state.emailUsed || state.formError || state.fieldErrors);
  const { ref, onInput } = useAuthForm(failed ? state : null);

  return (
    <form ref={ref} onInput={onInput} action={action} noValidate className="flex w-full min-h-0 flex-1 flex-col items-start gap-[16px]">
      {/* Where to continue afterwards, e.g. the hotel code the guest scanned before having an account. */}
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
      <div className="flex w-full flex-col items-start gap-[8px]">
        <h1 className={`w-full ${type.title}`}>Create your account</h1>
        {hasProtectedCallback(callbackUrl) ? (
          <p className={`w-full ${type.body} font-semibold text-atlas-ink`}>Sign in to continue.</p>
        ) : null}
        <p className={`w-full ${type.body} text-atlas-slate`}>
          Your account keeps your plan and achievements. Guests normally start by scanning the code at their hotel.
        </p>
        <p className="font-manrope text-[14px] leading-[19px] text-atlas-slate">
          Already have an account?{" "}
          <AtlasLink
            to="SignIn"
            query={callbackQuery(callbackUrl)}
            className="inline-block py-[8px] font-semibold text-atlas-teal underline underline-offset-2"
          >
            Sign in
          </AtlasLink>
        </p>
      </div>

      {state.formError ? <ErrorBanner>{state.formError}</ErrorBanner> : null}

      {google ? <GoogleSignInButton /> : null}

      <div className="flex w-full flex-col items-start gap-[16px]">
        <AtlasField
          id="name"
          label="Your name"
          placeholder="First name"
          autoComplete="given-name"
          defaultValue={state.values?.name}
          error={errors.name}
          optional
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
            <AtlasLink to="SignIn" query={callbackQuery(callbackUrl)} className={LINK}>
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
        <ConsentLine />
      </div>
    </form>
  );
}
