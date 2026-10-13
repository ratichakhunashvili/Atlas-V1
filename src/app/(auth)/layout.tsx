import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-center text-2xl font-semibold tracking-tight">Atlas</h1>
        {children}
      </div>
    </div>
  );
}
