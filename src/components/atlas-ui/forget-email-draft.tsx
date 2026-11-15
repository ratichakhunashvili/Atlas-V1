"use client";

import { useEffect } from "react";
import { clearEmailDraft } from "@/features/legal/email-draft";

/**
 * Rendered on signed-in guest screens. Signing in (with a password or Google) always lands here, so the email typed on
 * the sign-in screens is forgotten and never pre-fills the sign-in form for whoever uses this tab after sign-out.
 */
export function ForgetEmailDraft() {
  useEffect(() => {
    let storage: Storage | null = null;
    try {
      storage = window.sessionStorage;
    } catch {
      return;
    }
    clearEmailDraft(storage);
  }, []);
  return null;
}
