import { redirect } from "next/navigation";

/* "Password changed" now appears in place on /reset-password, only after the server confirms; this address must not look like a success. */
export default function ResetDonePage() {
  redirect("/login");
}
