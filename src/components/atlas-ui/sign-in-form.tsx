"use client";

import { useActionState } from "react";
import { loginAction, type SignInState } from "@/auth/actions";
import { callbackQuery, hasProtectedCallback } from "@/auth/callback";
import { AtlasIcon } from "./asset";
import { ConsentLine, SESSION_ENDED_MESSAGE, useAuthForm } from "./auth-parts";
import { GoogleSignInButton } from "./google-sign-in";
import { AtlasButton, AtlasField, AtlasLink, Spacer, type } from "./ui";

/*
 * SignIn · Sign in / create account — Figma frame 1:722, "Sign in" variant of the Auth form set
 * (1:4999). The mode switch's "Create account" half opens the SignUp screen (70:3586).
 *
 * Posts to loginAction; a wrong email or password comes back as form state and is announced, and
 * focus moves to the first field with a problem or to the error. The form skips the browser's own
 * validation bubbles (noValidate) so every message looks the same.
 */

const TAB =
  "flex min-h-[44px] min-w-0 flex-1 items-center justify-center px-[8px] py-[8px] text-center font-manrope text-[14px] font-semibold leading-[19px]";

export function ErrorBanner({ children }: { children: string }) {
  return (
    <div
      role="alert"
      tabIndex={-1}
      data-form-error
      className="flex w-full items-start gap-[10px] rounded-[12px] border border-atlas-danger bg-atlas-danger-soft px-[14px] py-[12px] outline-none focus-visible:outline-2 focus-visible:outline-atlas-danger"
    >
      <AtlasIcon src="/atlas-ui/icon-info-danger-18.svg" size={18} className="mt-px shrink-0" />
      <p className="min-w-0 flex-1 font-manrope text-[14px] leading-[1.45] text-atlas-danger">{children}</p>
    </div>
  );
}

/**
 * `sessionEnded`: sent here because the session ended (expired, or signed out everywhere); said instead of the generic line.
 * `google`: show "Continue with Google" (the page renders its form, GoogleSignInForm). `notice`: a message for an
 * ?error= code, e.g. a refused Google sign-in (auth/google.ts signInErrorMessage).
 */
export function AtlasSignInForm({
  callbackUrl,
  sessionEnded = false,
  google = false,
  notice = null,
}: {
  callbackUrl?: string;
  sessionEnded?: boolean;
  google?: boolean;
  notice?: string | null;
}) {
  const [state, action, pending] = useActionState<SignInState, FormData>(loginAction, {});
  const fieldErrors = state.fieldErrors ?? {};
  const failed = Boolean(state.error || state.fieldErrors);
  const { ref, onInput } = useAuthForm(failed ? state : null);

  return (
    <form ref={ref} onInput={onInput} action={action} noValidate className="flex w-full min-h-0 flex-1 flex-col items-start gap-[16px]">
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
      <div className="flex w-full flex-col items-start gap-[8px]">
        <h1 className={`w-full ${type.title}`}>Sign in to Atlas</h1>
        {sessionEnded ? (
          <p className={`w-full ${type.body} font-semibold text-atlas-ink`}>{SESSION_ENDED_MESSAGE}</p>
        ) : hasProtectedCallback(callbackUrl) ? (
          <p className={`w-full ${type.body} font-semibold text-atlas-ink`}>Sign in to continue.</p>
        ) : null}
        <p className={`w-full ${type.body} text-atlas-slate`}>
          Atlas helps you make the most of your hotel stay. Guests normally start by scanning the code at their hotel.
        </p>
      </div>

      <nav aria-label="Sign in or create an account" className="flex w-full overflow-hidden rounded-[12px] border border-atlas-beige">
        <span aria-current="page" className={`${TAB} bg-atlas-teal text-atlas-paper`}>
          Sign in
        </span>
        <AtlasLink to="SignUp" query={callbackQuery(callbackUrl)} className={`${TAB} bg-atlas-paper text-atlas-teal`}>
          Create account
        </AtlasLink>
      </nav>

      {state.error && !state.fieldErrors ? <ErrorBanner>{state.error}</ErrorBanner> : notice && !failed ? <ErrorBanner>{notice}</ErrorBanner> : null}

      {google ? <GoogleSignInButton /> : null}

      <div className="flex w-full flex-col items-start gap-[16px]">
        <AtlasField
          id="email"
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          defaultValue={state.email}
          error={fieldErrors.email}
          required
        />
        <div className="flex w-full flex-col items-start gap-[2px]">
          <AtlasField
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            error={fieldErrors.password}
            required
          />
          <AtlasLink
            to="ForgotPassword"
            className="flex min-h-[44px] items-center font-manrope text-[14px] font-semibold leading-[19px] text-atlas-teal underline underline-offset-2"
          >
            Forgot password?
          </AtlasLink>
        </div>
      </div>

      <Spacer />

      <div className="flex w-full flex-col items-start gap-[10px]">
        <AtlasButton type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </AtlasButton>
        <ConsentLine />
      </div>
    </form>
  );
}
