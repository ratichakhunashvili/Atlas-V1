import { redirect } from "next/navigation";

// The hotel list lives at /admin, the console's home. This older address keeps working for bookmarks.
export default function AdminHotelsRedirect() {
  redirect("/admin");
}
