import type { ReactNode } from "react";

/* Guest sign-in and sign-up, on the Atlas design system (src/components/atlas-ui). */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="atlas-app w-full flex-1">{children}</div>;
}
