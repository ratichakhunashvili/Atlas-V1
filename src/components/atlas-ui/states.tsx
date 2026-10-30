import Link from "next/link";
import { AtlasIcon } from "./asset";

/*
 * Shared states — Figma frame "StatesKit · Shared states" (node 1:1491).
 *
 * Reused across screens: each appears in place of, or on top of, the normal content.
 * Everything here is presentational and takes its copy as props, so wiring real behaviour
 * later means passing different text and an action, not rewriting the markup.
 */

/** Banner shown at the top of Explore when location permission is off (node 1:1495). */
export function AtlasLocationOffBanner({
  message,
  actionLabel,
  actionHref,
}: {
  message: string;
  actionLabel: string;
  actionHref?: string;
}) {
  const action = (
    <span className="font-manrope text-[14px] font-semibold leading-[19px] text-atlas-teal">{actionLabel}</span>
  );

  return (
    <div className="flex w-full items-start gap-[10px] rounded-[14px] bg-atlas-sand px-[14px] py-[12px]">
      <AtlasIcon src="/atlas-ui/icon-pin.svg" size={20} className="shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-[6px]">
        <p className="font-manrope text-[14px] leading-[20px] text-atlas-ink">{message}</p>
        {actionHref ? (
          <Link href={actionHref} className="flex h-[24px] items-start">
            {action}
          </Link>
        ) : (
          <button type="button" className="flex h-[24px] items-start">
            {action}
          </button>
        )}
      </div>
    </div>
  );
}

/** Offline banner, usable on any screen (node 1:1503). */
export function AtlasOfflineBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="flex w-full items-center gap-[10px] rounded-[14px] bg-atlas-ink px-[14px] py-[12px]"
    >
      <AtlasIcon src="/atlas-ui/icon-wifi.svg" size={20} className="shrink-0" />
      <p className="min-w-0 flex-1 font-manrope text-[14px] leading-[20px] text-atlas-paper">{message}</p>
    </div>
  );
}

/** Loading placeholder for the list and the map sheet (node 1:1508). */
export function AtlasSkeletonCard() {
  return (
    <div
      aria-hidden
      className="flex w-full items-start gap-[12px] rounded-[16px] border border-atlas-beige p-[12px]"
    >
      <div className="size-[76px] shrink-0 rounded-[12px] bg-atlas-sand" />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-[8px] pt-[4px]">
        <div className="h-[10px] w-[100px] rounded-[5px] bg-atlas-sand" />
        <div className="h-[14px] w-[190px] rounded-[7px] bg-atlas-sand-deep" />
        <div className="h-[10px] w-[140px] rounded-[5px] bg-atlas-sand" />
      </div>
    </div>
  );
}

/** Could-not-load card with a retry action (node 1:1515). */
export function AtlasErrorCard({
  title,
  body,
  actionLabel,
  actionHref,
}: {
  title: string;
  body: string;
  actionLabel: string;
  actionHref?: string;
}) {
  const actionClassName =
    "flex h-[44px] items-center justify-center rounded-[12px] border border-atlas-teal px-[16px] font-manrope text-[14px] font-semibold leading-[19px] text-atlas-teal";

  return (
    <div className="flex w-full flex-col items-start gap-[10px] rounded-[16px] border border-atlas-beige p-[16px]">
      <p className="font-grotesk text-[16px] font-bold leading-[20px] text-atlas-teal">{title}</p>
      <p className="font-manrope text-[14px] leading-[19px] text-atlas-ink">{body}</p>
      {actionHref ? (
        <Link href={actionHref} className={actionClassName}>
          {actionLabel}
        </Link>
      ) : (
        <button type="button" className={actionClassName}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/** Toast shown after removing or replacing a stop (node 1:1521). */
export function AtlasUndoToast({ message, actionLabel }: { message: string; actionLabel: string }) {
  return (
    <div
      role="status"
      className="flex h-[52px] w-full items-center justify-between rounded-[14px] bg-atlas-ink pl-[16px] pr-[8px]"
    >
      <p className="font-manrope text-[14px] leading-[19px] text-atlas-paper">{message}</p>
      <button type="button" className="flex h-[44px] items-center px-[12px] font-manrope text-[14px] font-semibold leading-[19px] text-atlas-beige">
        {actionLabel}
      </button>
    </div>
  );
}

/** Confirmation toast (node 1:1526). */
export function AtlasConfirmationToast({ message }: { message: string }) {
  return (
    <div role="status" className="flex h-[52px] w-full items-center gap-[10px] rounded-[14px] bg-atlas-teal px-[16px]">
      <AtlasIcon src="/atlas-ui/icon-check-light.svg" size={20} className="shrink-0" />
      <p className="font-manrope text-[14px] leading-[19px] text-atlas-paper">{message}</p>
    </div>
  );
}

/**
 * Primary button in its working state (node 1:1531). The spinner is the one piece of motion
 * in this kit — a still spinner reads as broken — and it respects reduced-motion settings.
 */
export function AtlasBusyButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      aria-busy="true"
      className="flex h-[52px] w-full items-center justify-center gap-[10px] rounded-[14px] bg-atlas-teal-soft"
    >
      <AtlasIcon src="/atlas-ui/icon-spinner.svg" size={18} className="motion-safe:animate-spin" />
      <span className="font-manrope text-[16px] font-semibold leading-[22px] text-atlas-paper">{label}</span>
    </button>
  );
}

/** Text field in its error state (node 1:1537). */
export function AtlasFieldWithError({
  id,
  label,
  name,
  type = "text",
  defaultValue,
  error,
}: {
  id: string;
  label: string;
  name?: string;
  type?: string;
  defaultValue?: string;
  error: string;
}) {
  const errorId = `${id}-error`;

  return (
    <div className="flex w-full flex-col items-start gap-[6px]">
      <label htmlFor={id} className="font-manrope text-[14px] font-semibold leading-[19px] text-atlas-ink">
        {label}
      </label>
      <input
        id={id}
        name={name ?? id}
        type={type}
        defaultValue={defaultValue}
        aria-invalid="true"
        aria-describedby={errorId}
        className="h-[52px] w-full rounded-[12px] border-2 border-atlas-danger bg-white px-[14px] font-manrope text-[16px] leading-[22px] text-atlas-ink outline-none"
      />
      <p id={errorId} className="font-manrope text-[13px] leading-[18px] text-atlas-danger">
        {error}
      </p>
    </div>
  );
}
