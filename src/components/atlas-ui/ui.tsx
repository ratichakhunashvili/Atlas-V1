import Link from "next/link";
import type { ReactNode } from "react";
import { AtlasIcon } from "./asset";
import { screenHref, type ScreenKey } from "./screen-hrefs";

/*
 * Primitives shared by every screen: links that follow the design's prototype connections,
 * buttons, the back button, form fields, badges and type styles.
 *
 * Line heights are the Figma text-node heights. Figma's "normal" line height for Manrope is
 * 1.366 of the font size and for Space Grotesk 1.276, so 14px Manrope sits in a 19px line and
 * 16px Space Grotesk in a 20px one. Setting them explicitly keeps long screens from drifting.
 */

export const type = {
  eyebrow: "font-grotesk text-[11px] font-medium uppercase leading-[14px] tracking-[0.88px] text-atlas-slate",
  title: "font-grotesk text-[24px] font-bold leading-[28px] text-atlas-teal",
  body: "font-manrope text-[15px] leading-[23px]",
  point: "font-manrope text-[15px] leading-[23px] text-atlas-ink",
  label: "font-manrope text-[14px] font-semibold leading-[19px] text-atlas-ink",
  caption: "font-manrope text-[12px] leading-[16px] text-atlas-slate",
  heading16: "font-grotesk text-[16px] font-bold leading-[20px] text-atlas-teal",
} as const;

/**
 * A link to another screen in the design. Renders an inert element while the target screen
 * does not exist yet, so nothing ever points at a missing route.
 */
export function AtlasLink({
  to,
  className,
  children,
  label,
}: {
  to: ScreenKey;
  className?: string;
  children: ReactNode;
  /** Accessible name, for links whose content is only an icon. */
  label?: string;
}) {
  const href = screenHref(to);
  if (!href) {
    return (
      <span className={className} aria-label={label} aria-disabled="true">
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={className} aria-label={label}>
      {children}
    </Link>
  );
}

const BUTTON =
  "flex min-h-[52px] w-full shrink-0 items-center justify-center gap-[8px] rounded-[14px] px-[12px] py-[4px] text-center font-manrope text-[16px] font-semibold leading-[22px]";

export type ButtonTone = "primary" | "outline" | "light";

const TONES: Record<ButtonTone, string> = {
  primary: "bg-atlas-teal text-atlas-paper",
  outline: "border border-atlas-teal text-atlas-teal",
  light: "bg-atlas-paper text-atlas-teal",
};

/** Full-width 52px action. Navigates to `to` when given, otherwise renders a button. */
export function AtlasButton({
  to,
  tone = "primary",
  icon,
  iconSize = 19,
  children,
  className = "",
  type: buttonType = "button",
  onClick,
  disabled,
}: {
  to?: ScreenKey;
  tone?: ButtonTone;
  icon?: string;
  iconSize?: number;
  children: ReactNode;
  className?: string;
  type?: "button" | "submit";
  onClick?: () => void;
  /** Buttons only (not links): a submit that is already in flight. */
  disabled?: boolean;
}) {
  const classes = `${BUTTON} ${TONES[tone]} ${className}`;
  const content = (
    <>
      {icon ? <AtlasIcon src={icon} size={iconSize} className="shrink-0" /> : null}
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </>
  );
  if (to) {
    return (
      <AtlasLink to={to} className={classes}>
        {content}
      </AtlasLink>
    );
  }
  return (
    <button type={buttonType} onClick={onClick} disabled={disabled} className={`${classes} disabled:opacity-60`}>
      {content}
    </button>
  );
}

/** Centred 44px text action under a primary button ("Not now", "Use a different email"). */
export function AtlasTextLink({
  to,
  children,
  className = "",
  onClick,
  tone = "teal",
}: {
  to?: ScreenKey;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  /** Slate for the quieter third action ("Cancel", "Just show me places") in some frames. */
  tone?: "teal" | "slate";
}) {
  const color = tone === "slate" ? "text-atlas-slate" : "text-atlas-teal";
  const classes = `flex h-[44px] w-full shrink-0 items-center justify-center font-manrope text-[15px] font-semibold leading-[20px] ${color} ${className}`;
  if (to) {
    return (
      <AtlasLink to={to} className={classes}>
        {children}
      </AtlasLink>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      {children}
    </button>
  );
}

/** 44px square back button with a beige outline (icon/back). */
export function AtlasBackButton({ to, className = "" }: { to: ScreenKey; className?: string }) {
  return (
    <AtlasLink
      to={to}
      label="Back"
      className={`flex size-[44px] shrink-0 items-center justify-center rounded-[12px] border border-atlas-beige bg-atlas-paper ${className}`}
    >
      <AtlasIcon src="/atlas-ui/icon-back.svg" size={20} />
    </AtlasLink>
  );
}

/** Round icon badge at the top of message screens. */
export function AtlasBadge({
  icon,
  iconSize,
  size = 64,
  tone = "teal",
}: {
  icon: string;
  iconSize: number;
  size?: 56 | 64 | 72;
  tone?: "teal" | "sand";
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full ${tone === "teal" ? "bg-atlas-teal" : "bg-atlas-sand"}`}
      style={{ width: size, height: size }}
    >
      <AtlasIcon src={icon} size={iconSize} />
    </div>
  );
}

/**
 * Labelled text field (Field · Email, Field · Password...). An `error` replaces the hint with a
 * Danger message, thickens the outline to 2px (padding shrinks by 1px so the text stays put) and
 * marks the input invalid for assistive technology.
 */
export function AtlasField({
  id,
  label,
  type: inputType = "text",
  placeholder,
  hint,
  error,
  defaultValue,
  autoComplete,
  required,
}: {
  id: string;
  label: string;
  type?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  defaultValue?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  const message = error ?? hint;
  const messageId = message ? `${id}-${error ? "error" : "hint"}` : undefined;
  return (
    <div className="flex w-full flex-col items-start gap-[6px]">
      <label htmlFor={id} className={type.label}>
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={inputType}
        placeholder={placeholder}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        required={required}
        aria-describedby={messageId}
        aria-invalid={error ? true : undefined}
        className={`h-[52px] w-full rounded-[12px] bg-white font-manrope text-[16px] leading-[22px] text-atlas-ink placeholder:text-atlas-slate/70 focus:outline-2 focus:outline-offset-0 focus:outline-atlas-teal ${
          error ? "border-2 border-atlas-danger px-[13px]" : "border border-atlas-umber px-[14px] focus:border-atlas-teal"
        }`}
      />
      {message ? (
        <p id={messageId} className={`font-manrope text-[13px] leading-[18px] ${error ? "text-atlas-danger" : "text-atlas-slate"}`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}

/** Icon-led bullet points ("Only while Atlas is open.", "Ask the front desk..."). */
export function AtlasPoints({ items, gap = 12 }: { items: { icon: string; text: string }[]; gap?: number }) {
  return (
    <ul className="flex w-full flex-col items-start" style={{ gap }}>
      {items.map((item) => (
        <li key={item.text} className="flex w-full items-start gap-[12px]">
          <AtlasIcon src={item.icon} size={20} className="shrink-0" />
          <p className={`min-w-0 flex-1 ${type.point}`}>{item.text}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Full-height flow screen (sign in, permissions, messages): 20px gutters, 16px top, 28px
 * bottom, with a spacer that pushes the actions to the bottom edge. On tablets and desktops the
 * same column becomes a centred card on Warm Sand, so forms keep a readable measure instead of
 * stretching edge to edge. Safe-area insets keep it clear of notches and home indicators.
 */
export function FlowScreen({
  children,
  gap = 16,
  className = "",
}: {
  children: ReactNode;
  gap?: number;
  className?: string;
}) {
  return (
    <div className="flex min-h-[100dvh] w-full justify-center md:bg-atlas-dune md:px-[24px] md:py-[32px]">
      <div
        className={`relative flex min-h-[100dvh] w-full max-w-[560px] flex-col items-start bg-atlas-paper px-[20px] pb-[calc(28px+env(safe-area-inset-bottom))] pt-[calc(16px+env(safe-area-inset-top))] md:min-h-[min(844px,calc(100dvh-64px))] md:rounded-[24px] md:border md:border-atlas-beige md:px-[32px] md:shadow-[0px_10px_40px_0px_rgba(28,41,41,0.08)] ${className}`}
        style={{ gap }}
      >
        {children}
      </div>
    </div>
  );
}

/** Flexible gap that pushes what follows to the bottom of a FlowScreen. */
export function Spacer() {
  return <div aria-hidden className="min-h-px flex-1" />;
}
