import type { InputHTMLAttributes } from "react";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
  /** Optional guidance under the input, tied to it for screen readers. */
  hint?: string;
};

export function Field({ label, name, hint, className = "", ...props }: FieldProps) {
  const hintId = hint ? `${name}-hint` : undefined;

  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        id={name}
        name={name}
        aria-describedby={hintId}
        className={`block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none ${className}`}
        {...props}
      />
      {hint && (
        <span id={hintId} className="block text-xs text-slate-500">
          {hint}
        </span>
      )}
    </label>
  );
}
