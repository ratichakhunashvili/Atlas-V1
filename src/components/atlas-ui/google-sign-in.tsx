"use client";

import { useState } from "react";
import { googleSignInAction } from "@/auth/actions";

/*
 * "Continue with Google" (Phase 3) on the sign-in and sign-up screens. The button sits inside the email form for
 * layout, but submits its OWN small form (HTML's form attribute), so nothing typed into the email form, a password
 * least of all, is sent with it. Works without JavaScript. Shown only when the server says Google is configured.
 */

export const GOOGLE_FORM_ID = "atlas-google-sign-in";

/** The form the button submits. Rendered once per screen, outside the email form (forms cannot nest). */
export function GoogleSignInForm({ callbackUrl }: { callbackUrl?: string }) {
  return (
    <form id={GOOGLE_FORM_ID} action={googleSignInAction} hidden>
      {/* Where to continue afterwards, e.g. the hotel code scanned before signing in. Checked again on the server. */}
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
    </form>
  );
}

/** Google's "G" mark, as its sign-in guidelines ask for on a "Continue with Google" button. */
function GoogleMark() {
  return (
    <svg aria-hidden width="20" height="20" viewBox="0 0 48 48" className="shrink-0">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** The button and the "or" line under it. */
export function GoogleSignInButton() {
  const [opening, setOpening] = useState(false);
  return (
    <div className="flex w-full flex-col items-stretch gap-[12px]">
      <button
        type="submit"
        form={GOOGLE_FORM_ID}
        disabled={opening}
        // After the browser has started the submit: disabling now only stops a second tap.
        onClick={() => setTimeout(() => setOpening(true), 0)}
        className="flex min-h-[52px] w-full items-center justify-center gap-[10px] rounded-[14px] border border-atlas-beige bg-atlas-paper px-[12px] py-[4px] font-manrope text-[16px] font-semibold leading-[22px] text-atlas-ink outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-atlas-teal disabled:opacity-70"
      >
        <GoogleMark />
        {opening ? "Opening Google…" : "Continue with Google"}
      </button>
      <div aria-hidden className="flex w-full items-center gap-[10px] font-manrope text-[13px] leading-[18px] text-atlas-slate">
        <span className="h-px flex-1 bg-atlas-beige" />
        or use your email
        <span className="h-px flex-1 bg-atlas-beige" />
      </div>
    </div>
  );
}
