import type { ReactNode } from "react";

export function Alert({
  variant = "error",
  children,
}: {
  variant?: "error" | "success";
  children: ReactNode;
}) {
  const styles =
    variant === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-green-200 bg-green-50 text-green-700";

  return <div className={`rounded-md border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}
