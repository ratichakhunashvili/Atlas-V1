"use client";

import { useEffect } from "react";
import { consumeFocusRequest } from "@/lib/focus";

/**
 * Moves focus to `targetId` after a form on this screen posted a server action and the server sent the screen back
 * with new content (U094: choosing an activity used to drop focus to <body>, because the pressed button is gone).
 *
 * Only acts on a request made by that form (PendingSubmit's `focusAfterAction`), never on a plain visit. It re-checks
 * whenever `stamp` changes: the redirect lands on the same route, so React keeps this component mounted and only the
 * stamp (a summary of the screen's state) tells it the new content has arrived. The target needs tabIndex={-1}.
 */
export function FocusAfterAction({ focusKey, targetId, stamp }: { focusKey: string; targetId: string; stamp: string }) {
  useEffect(() => {
    if (!consumeFocusRequest(focusKey)) return;
    document.getElementById(targetId)?.focus();
  }, [focusKey, targetId, stamp]);
  return null;
}
