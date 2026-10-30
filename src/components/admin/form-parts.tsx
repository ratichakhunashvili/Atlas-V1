import type { ReactNode } from "react";
import { AtlasIcon } from "@/components/atlas-ui/asset";
import { AtlasLink, type } from "@/components/atlas-ui/ui";
import type { ScreenKey } from "@/components/atlas-ui/screen-hrefs";

/*
 * The one admin form layout (hotel, place, partnership, facility, QR code, achievement): a white
 * card up to 680px wide, fields in rows of two that stack on phones, and Save / Cancel actions.
 *
 * Prototype honesty: nothing is submitted. The fields hold the design's sample values and the
 * actions are links that follow the prototype ("Save hotel ⇒ AdminHotels").
 *
 * Field heights differ between frames — 44px in the hotel and place forms, 48px in the rest —
 * so every control takes the frame's height.
 */

export type FieldHeight = 44 | 48;

const CONTROL =
  "w-full rounded-[12px] border border-atlas-umber bg-white px-[14px] font-manrope text-[16px] leading-[22px] text-atlas-ink placeholder:text-atlas-slate/70 focus:border-atlas-teal";

export function AdminFormCard({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <form
      noValidate
      aria-label={title}
      className="flex w-full max-w-[680px] flex-col items-start gap-[16px] rounded-[14px] border border-atlas-beige bg-white p-[16px] sm:p-[24px]"
    >
      {title ? <h2 className="font-grotesk text-[17px] font-bold leading-[22px] text-atlas-teal">{title}</h2> : null}
      {description ? <p className="w-full font-manrope text-[13px] leading-[1.5] text-atlas-slate">{description}</p> : null}
      {children}
    </form>
  );
}

/** Two fields side by side from 640px, stacked below. */
export function FormRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex w-full flex-col items-start gap-[16px] sm:flex-row [&>*]:min-w-0 sm:[&>*]:flex-1 ${className}`}>
      {children}
    </div>
  );
}

function FieldFrame({
  id,
  label,
  hint,
  className = "",
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex w-full flex-col items-start gap-[6px] ${className}`}>
      <label htmlFor={id} className={type.label}>
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="w-full font-manrope text-[13px] leading-[18px] text-atlas-slate">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type FieldProps = {
  id: string;
  label: string;
  defaultValue?: string;
  hint?: string;
  height?: FieldHeight;
  /** Width overrides, for the fields the design draws narrower than the row (Status: 300px). */
  className?: string;
};

export function AdminInput({
  inputMode,
  autoComplete = "off",
  ...field
}: FieldProps & { inputMode?: "decimal" | "numeric" | "tel"; autoComplete?: string }) {
  const { id, defaultValue, hint, height = 44 } = field;
  return (
    <FieldFrame {...field}>
      <input
        id={id}
        name={id}
        type="text"
        inputMode={inputMode}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={CONTROL}
        style={{ height }}
      />
    </FieldFrame>
  );
}

export function AdminTextarea({ minHeight = 72, ...field }: Omit<FieldProps, "height"> & { minHeight?: 64 | 72 }) {
  const { id, defaultValue, hint } = field;
  return (
    <FieldFrame {...field}>
      <textarea
        id={id}
        name={id}
        defaultValue={defaultValue}
        rows={2}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={`${CONTROL} block resize-y py-[13px]`}
        style={{ minHeight }}
      />
    </FieldFrame>
  );
}

/** Native select with the design's icon/down, so keyboard and screen-reader behaviour is the platform's. */
export function AdminSelect({ options, ...field }: FieldProps & { options: readonly string[] }) {
  const { id, defaultValue, hint, height = 44 } = field;
  return (
    <FieldFrame {...field}>
      <div className="relative w-full">
        <select
          id={id}
          name={id}
          defaultValue={defaultValue}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={`${CONTROL} cursor-pointer appearance-none pr-[44px]`}
          style={{ height }}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <AtlasIcon
          src="/atlas-ui/icon-down-slate-18.svg"
          size={18}
          className="pointer-events-none absolute right-[15px] top-1/2 -translate-y-1/2"
        />
      </div>
    </FieldFrame>
  );
}

/** Button · Save … ⇒ list and Button · Cancel ⇒ list. */
export function FormActions({ save, to, cancelTo }: { save: string; to: ScreenKey; cancelTo?: ScreenKey }) {
  const base =
    "flex h-[48px] shrink-0 items-center justify-center whitespace-nowrap rounded-[12px] px-[24px] font-manrope text-[15px] font-semibold leading-[20px]";
  return (
    <div className="flex w-full flex-wrap items-start gap-[12px]">
      <AtlasLink to={to} className={`${base} bg-atlas-teal text-atlas-paper`}>
        {save}
      </AtlasLink>
      <AtlasLink to={cancelTo ?? to} className={`${base} border border-atlas-teal text-atlas-teal`}>
        Cancel
      </AtlasLink>
    </div>
  );
}
