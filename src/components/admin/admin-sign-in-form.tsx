"use client";

import { useActionState } from "react";
import { loginAction, type SignInState } from "@/auth/actions";
import { AtlasLogo } from "@/components/atlas-ui/asset";
import { ErrorBanner } from "@/components/atlas-ui/sign-in-form";
import { AtlasButton, AtlasField, type } from "@/components/atlas-ui/ui";

/*
 * AdminSignIn · Admin sign-in — Figma frame 70:780. The same accounts as the guest app; signing in
 * here only lands on the admin console. Whether the account may use it is checked by
 * requireAdmin() on the console itself (a non-admin is sent to Access denied).
 */
export function AdminSignInForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(loginAction, {});

  return (
    <form
      action={action}
      aria-labelledby="admin-sign-in-title"
      className="flex w-full max-w-[420px] flex-col items-start gap-[16px] rounded-[16px] border border-atlas-beige bg-white p-[24px] sm:p-[32px]"
    >
      <input type="hidden" name="area" value="admin" />
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
      <AtlasLogo tone="teal" width={42} height={48} />
      <div className="flex w-full flex-col items-start gap-[6px]">
        <h1 id="admin-sign-in-title" className={type.title}>
          Admin sign-in
        </h1>
        <p className="font-manrope text-[14px] leading-[19px] text-atlas-slate">For Atlas platform admins only.</p>
      </div>
      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}
      <AtlasField
        id="email"
        label="Email"
        type="email"
        placeholder="admin@example.com"
        autoComplete="username"
        defaultValue={state.email}
        required
      />
      <AtlasField id="password" label="Password" type="password" autoComplete="current-password" required />
      <AtlasButton type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </AtlasButton>
    </form>
  );
}
