"use client";

import { useFormStatus } from "react-dom";
import { AtlasButton } from "./ui";

/*
 * The submit button inside a sign-out <form action={…}>: "Signing out…" and disabled while the action runs, so a
 * second tap can't send it twice and the guest or admin can see something is happening. Must be rendered inside the
 * form (useFormStatus reads the nearest parent form).
 *
 * Without `className` it is the guest app's primary AtlasButton (profile's sign-out confirmation); with it, a plain
 * button styled by the caller (the admin sidebar).
 */
export function SignOutButton({ className }: { className?: string }) {
  const { pending } = useFormStatus();
  const label = pending ? "Signing out…" : "Sign out";
  if (className === undefined) {
    return (
      <AtlasButton type="submit" disabled={pending}>
        {label}
      </AtlasButton>
    );
  }
  return (
    <button type="submit" disabled={pending} className={`${className} disabled:cursor-wait disabled:opacity-70`}>
      {label}
    </button>
  );
}
