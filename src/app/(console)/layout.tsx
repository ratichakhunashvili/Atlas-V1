import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/authorization";

/*
 * The admin console: every admin frame with the sidebar (Figma 70:811–70:2027). AdminSignIn and
 * AdminDenied live in (admin-auth) under the same /admin URLs, without this layout.
 *
 * requireAdmin() is the authorization boundary for every page here (the proxy redirect is only
 * a convenience); each admin server action checks it again before touching the database.
 */

export const metadata: Metadata = { title: { template: "%s · Atlas admin", default: "Atlas admin" } };

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  return <AdminShell email={admin.email ?? ""}>{children}</AdminShell>;
}
