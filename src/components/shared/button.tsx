import type { ButtonHTMLAttributes } from "react";

export const buttonStyles = {
  primary:
    "inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50",
  secondary:
    "inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50",
  danger:
    "inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50",
} as const;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonStyles;
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return <button className={`${buttonStyles[variant]} ${className}`} {...props} />;
}
