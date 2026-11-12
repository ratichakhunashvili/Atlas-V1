"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonVariant } from "@/components/shared/button";

/*
 * An admin submit button that can't be pressed again while its form's server action runs, and says it is working.
 * Presentation only: the server action stays idempotent for a second submit that slips through.
 */
export function PendingButton({
  pendingLabel,
  variant,
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & { pendingLabel: string; variant?: ButtonVariant }) {
  const { pending } = useFormStatus();
  return (
    <Button {...props} type="submit" variant={variant} disabled={pending || props.disabled} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
