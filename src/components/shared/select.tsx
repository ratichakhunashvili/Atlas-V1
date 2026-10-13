import type { SelectHTMLAttributes } from "react";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  name: string;
};

export function Select({ label, name, className = "", children, ...props }: SelectProps) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select
        id={name}
        name={name}
        className={`block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none ${className}`}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}
