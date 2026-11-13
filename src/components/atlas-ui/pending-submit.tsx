"use client";

import { useEffect, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { requestFocusAfterAction } from "@/lib/focus";

/**
 * A submit button that shows it is working and can't be pressed twice while its form's server action runs.
 * Without this, a slow save looks like a dead button and a second tap sends a second request.
 *
 * `focusAfterAction` (opt-in) names the screen whose FocusAfterAction should move focus once the action's result is
 * shown — for buttons that disappear when their action succeeds, so focus doesn't fall to <body>.
 */
export function PendingSubmit({
  children,
  pendingLabel,
  className,
  ariaLabel,
  focusAfterAction,
}: {
  children: ReactNode;
  pendingLabel: string;
  className: string;
  ariaLabel?: string;
  focusAfterAction?: string;
}) {
  const { pending } = useFormStatus();
  useEffect(() => {
    if (pending && focusAfterAction) requestFocusAfterAction(focusAfterAction);
  }, [pending, focusAfterAction]);
  return (
    <button type="submit" disabled={pending} aria-label={pending ? pendingLabel : ariaLabel} aria-busy={pending} className={`${className} disabled:opacity-70`}>
      {pending ? pendingLabel : children}
    </button>
  );
}
