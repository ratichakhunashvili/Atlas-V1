"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * A submit button that shows it is working and can't be pressed twice while its form's server action runs.
 * Without this, a slow save looks like a dead button and a second tap sends a second request.
 */
export function PendingSubmit({
  children,
  pendingLabel,
  className,
  ariaLabel,
}: {
  children: ReactNode;
  pendingLabel: string;
  className: string;
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-label={pending ? pendingLabel : ariaLabel} aria-busy={pending} className={`${className} disabled:opacity-70`}>
      {pending ? pendingLabel : children}
    </button>
  );
}
