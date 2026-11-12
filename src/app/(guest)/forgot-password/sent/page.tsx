import { redirect } from "next/navigation";

/* The result now appears in place on /forgot-password; this old address must not look like a success. */
export default function ForgotSentPage() {
  redirect("/forgot-password");
}
