"use client";

import Link from "next/link";
import { useEffect, useRef, type FormEvent } from "react";
import { readEmailDraft, writeEmailDraft } from "@/features/legal/email-draft";

/* Pieces shared by the sign-in and sign-up forms. */

/** Shown on /login and /admin/sign-in for ?reason=session-ended, in place of "Sign in to continue." */
export const SESSION_ENDED_MESSAGE = "Your session ended. Sign in to continue.";

const INLINE_LINK = "inline-block py-[4px] font-semibold text-atlas-teal underline underline-offset-2";

/** The consent line, with real links to the Terms and the Privacy notice. */
export function ConsentLine() {
  return (
    <p className="w-full text-center font-manrope text-[12px] leading-[1.5] text-atlas-slate">
      By continuing you agree to Atlas&apos;s{" "}
      <Link href="/terms" className={INLINE_LINK}>
        Terms
      </Link>{" "}
      and{" "}
      <Link href="/privacy" className={INLINE_LINK}>
        Privacy notice
      </Link>
      .
    </p>
  );
}

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Form behaviour for sign in and sign up: after a failed submit, focus moves to the first invalid field
 * (or to the form-level error), and the typed email survives moving between the two screens.
 * `failure` should be a new value each time the server answers with a problem, and null otherwise.
 */
export function useAuthForm(failure: unknown) {
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const email = ref.current?.elements.namedItem("email");
    if (email instanceof HTMLInputElement && !email.value) {
      const draft = readEmailDraft(sessionStore());
      if (draft) email.value = draft;
    }
  }, []);

  useEffect(() => {
    if (!failure) return;
    const form = ref.current;
    const target = form?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? form?.querySelector<HTMLElement>("[data-form-error]");
    target?.focus();
  }, [failure]);

  const onInput = (event: FormEvent<HTMLFormElement>) => {
    const field = event.target;
    if (field instanceof HTMLInputElement && field.name === "email") writeEmailDraft(sessionStore(), field.value);
  };

  return { ref, onInput };
}
