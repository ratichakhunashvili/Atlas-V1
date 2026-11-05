"use client";

import type { ButtonHTMLAttributes, MouseEvent } from "react";
import { Button, type ButtonVariant } from "@/components/shared/button";

/*
 * A submit button for destructive admin actions (revoke, end, suspend, archive, delete, remove).
 * It asks once, in the browser's own dialog, before the form posts. This is a guard against a
 * mis-click only: the server action still checks the admin and the record's current state.
 */
export function ConfirmSubmit({
  confirm,
  variant = "danger",
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  /** The question shown before submitting, e.g. "Revoke this code? Printed copies stop working." */
  confirm: string;
  variant?: ButtonVariant;
}) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (!window.confirm(confirm)) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  return <Button type="submit" variant={variant} onClick={handleClick} {...props} />;
}
