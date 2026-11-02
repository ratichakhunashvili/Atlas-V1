"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { CAMERA_PROBLEM_COPY, useQrCamera, type QrCameraState, type QrTorch } from "@/components/qr/use-qr-camera";
import type { CheckInMethod } from "@/db/schema";
import { extractQrToken } from "@/services/qr/extract";
import { AtlasIcon } from "./asset";
import { AtlasBottomBar } from "./bottom-bar";
import type { ScanProblem } from "./scan-problems";
import { type ScreenKey } from "./screen-hrefs";
import { AtlasButton, AtlasLink, AtlasTextLink } from "./ui";
import { acceptedProofs, useStopCheckIn } from "./use-stop-check-in";

/*
 * The Scan tab (1:410), Join your hotel (70:3730) and the check-in problem cases (1:1042 – 1:1127).
 *
 * The camera area shows the real camera through the shared useQrCamera reader. What a code means is decided on the
 * server only: a place code goes to the QR check-in action, a hotel code to the existing /checkin/<token> landing
 * with its explicit "Start my stay" button.
 *
 * Every camera screen fits the screen exactly (no page scroll): the camera area takes whatever height the sheet
 * leaves. Wide layout: the sheet becomes a panel beside the camera area.
 */

export function CameraLayout({ camera, panel, label, labelTop = 520 }: { camera: ReactNode; panel: ReactNode; label?: string; labelTop?: number }) {
  return (
    <main className="flex h-[100dvh] w-full flex-col overflow-hidden bg-atlas-night wide:grid wide:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
      <div className="atlas-dark relative min-h-0 w-full flex-1 overflow-hidden [container-type:size] wide:h-full">
        {camera}
        {label ? (
          <p
            aria-hidden
            className="absolute left-0 right-0 px-[16px] text-center font-manrope text-[12px] leading-[16px] text-atlas-mist wide:bottom-[20px] wide:top-auto!"
            style={{ top: `min(${labelTop}px, calc(100% - 36px))` }}
          >
            {label}
          </p>
        ) : null}
      </div>
      <div className="relative max-h-[62dvh] w-full shrink-0 overflow-y-auto wide:flex wide:h-full wide:max-h-none wide:flex-col wide:bg-atlas-paper">{panel}</div>
    </main>
  );
}

const TOP_BUTTON = "absolute top-[calc(12px+env(safe-area-inset-top))] z-20 flex size-[44px] items-center justify-center";

export function CloseButton({ to = "Main", label }: { to?: ScreenKey; label?: string }) {
  return (
    <AtlasLink
      to={to}
      label={label ?? (to === "AttractionDetail" ? "Close the camera view" : "Close the scanner")}
      className={`${TOP_BUTTON} left-[16px] rounded-[12px] bg-atlas-ink/75`}
    >
      <AtlasIcon src="/atlas-ui/icon-close-light.svg" size={20} />
    </AtlasLink>
  );
}

function FlashButton({ torch }: { torch: QrTorch }) {
  if (!torch.supported) return null;
  return (
    <button
      type="button"
      aria-pressed={torch.on}
      aria-label={torch.on ? "Turn the flashlight off" : "Turn the flashlight on"}
      onClick={torch.toggle}
      className={`${TOP_BUTTON} right-[16px] rounded-[22px] ${torch.on ? "bg-atlas-beige" : "bg-atlas-ink/75"}`}
    >
      <AtlasIcon src="/atlas-ui/icon-flash.svg" size={20} className={torch.on ? "invert" : ""} />
    </button>
  );
}

const CORNER = "absolute size-[44px] border-atlas-beige";

/** The four Warm Beige corners of the viewfinder; place inside a relative square. */
export function ViewfinderCorners() {
  return (
    <>
      <span className={`${CORNER} left-0 top-0 rounded-tl-[14px] border-l-4 border-t-4`} />
      <span className={`${CORNER} right-0 top-0 rounded-tr-[14px] border-r-4 border-t-4`} />
      <span className={`${CORNER} bottom-0 left-0 rounded-bl-[14px] border-b-4 border-l-4`} />
      <span className={`${CORNER} bottom-0 right-0 rounded-br-[14px] border-b-4 border-r-4`} />
    </>
  );
}

// Sized from the camera area's own height (it is a size container), so the frame never runs under the sheet.
const VIEWFINDER = "relative size-[max(88px,min(240px,calc(100vw-64px),calc(100cqh-200px)))] shrink-0";

/** What the camera area says under the viewfinder for each camera state. */
function cameraStatus(state: QrCameraState, busy: boolean): string | null {
  if (busy) return "Checking the code…";
  if (state === "starting") return "Starting the camera…";
  if (state === "scanning") return "Hold the code inside the frame";
  if (state in CAMERA_PROBLEM_COPY) return CAMERA_PROBLEM_COPY[state as keyof typeof CAMERA_PROBLEM_COPY];
  return null;
}

/**
 * The live camera with the heading and viewfinder on top. The video fills the camera area; a gradient keeps the
 * heading readable over a bright picture.
 */
function LiveCamera({
  regionId,
  heading,
  closeTo,
  state,
  torch,
  busy,
  showViewfinder,
}: {
  regionId: string;
  heading: ReactNode;
  closeTo: ScreenKey;
  state: QrCameraState;
  torch: QrTorch;
  busy: boolean;
  showViewfinder: boolean;
}) {
  const live = state === "starting" || state === "scanning";
  const status = showViewfinder ? cameraStatus(state, busy) : null;
  return (
    <>
      {/* The library restyles the element it renders into, so it gets an inner element inside a fixed frame. */}
      <div className="absolute inset-0 overflow-hidden" hidden={!live}>
        <div id={regionId} className="atlas-scan-region" />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[45%] bg-linear-to-b from-atlas-night/85 to-transparent" />
      <CloseButton to={closeTo} />
      <FlashButton torch={torch} />
      <div className="relative z-10 flex h-full flex-col items-center gap-[10px] px-[24px] pb-[16px] pt-[calc(64px+env(safe-area-inset-top))] wide:justify-center">
        <div className="flex w-full flex-col items-center gap-[4px] text-center wide:hidden">{heading}</div>
        {showViewfinder ? (
          <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-[10px]">
            <div className={VIEWFINDER}>
              <ViewfinderCorners />
              {busy ? <span className="absolute inset-0 animate-pulse rounded-[14px] bg-atlas-paper/15" /> : null}
            </div>
            {status ? (
              <p role="status" className="max-w-[320px] rounded-[10px] bg-atlas-ink/60 px-[10px] py-[4px] text-center font-manrope text-[13px] leading-[18px] text-atlas-paper">
                {status}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

const EYEBROW = "font-grotesk text-[11px] font-medium uppercase leading-[14px] tracking-[0.88px] text-atlas-beige";
const TITLE =
  "line-clamp-2 font-grotesk text-[22px] font-bold leading-[28px] text-atlas-paper [@media(max-height:640px)]:line-clamp-1 [@media(max-height:640px)]:text-[19px] [@media(max-height:640px)]:leading-[24px]";
const SUB = "w-full text-center font-manrope text-[14px] leading-[19px] text-atlas-fog [@media(max-height:640px)]:hidden";
const OUTLINE_BUTTON =
  "flex h-[48px] w-full shrink-0 items-center justify-center rounded-[14px] border border-atlas-teal font-manrope text-[15px] font-semibold text-atlas-teal disabled:opacity-60";
const SOLID_BUTTON =
  "flex h-[48px] w-full shrink-0 items-center justify-center rounded-[14px] bg-atlas-teal font-manrope text-[15px] font-semibold text-atlas-paper disabled:opacity-60";

/** "Type the code instead": the fallback when the camera can't read or isn't allowed. */
function TypedCode({ onSubmit, disabled }: { onSubmit: (code: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="font-manrope text-[14px] font-semibold text-atlas-teal underline underline-offset-2">
        Type the code instead
      </button>
    );
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = code.trim();
    if (value) onSubmit(value);
  }
  return (
    <form onSubmit={submit} className="flex w-full gap-[8px]">
      <label htmlFor="atlas-scan-typed-code" className="sr-only">
        Code printed under the QR code
      </label>
      <input
        id="atlas-scan-typed-code"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        required
        autoFocus
        placeholder="Code under the QR"
        className="h-[44px] min-w-0 flex-1 rounded-[12px] border border-atlas-sand-deep bg-white px-[12px] font-manrope text-[15px] text-atlas-ink"
      />
      <button type="submit" disabled={disabled} className="h-[44px] shrink-0 rounded-[12px] bg-atlas-teal px-[16px] font-manrope text-[15px] font-semibold text-atlas-paper disabled:opacity-60">
        Continue
      </button>
    </form>
  );
}

function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="w-full rounded-[10px] bg-atlas-danger-soft px-[12px] py-[8px] font-manrope text-[14px] leading-[19px] text-atlas-danger">
      {children}
    </p>
  );
}

const SHEET = "flex w-full flex-col items-start gap-[10px] rounded-t-[24px] bg-atlas-paper px-[16px] pb-[12px] pt-[16px] wide:rounded-none";

export type ScanTarget = { stopId: string; name: string; checkInMethod: CheckInMethod };
export type ScanEmpty = { title: string; body: string; action: { label: string; href: string } };

const SCAN_REGION = "atlas-scan-region";

/** Scan (centre tab): check in at today's current stop with its Atlas QR code, or by location. */
export function ScanScreen({ target, empty }: { target: ScanTarget | null; empty: ScanEmpty }) {
  if (!target) return <NothingToScan empty={empty} />;
  return <StopScanner target={target} />;
}

function NothingToScan({ empty }: { empty: ScanEmpty }) {
  const router = useRouter();
  const heading = (
    <>
      <h1 className={TITLE}>{empty.title}</h1>
      <p className={SUB}>{empty.body}</p>
    </>
  );
  return (
    <CameraLayout
      camera={
        <>
          <CloseButton />
          <div className="relative z-10 flex h-full flex-col items-center justify-center gap-[6px] px-[24px] text-center">
            <AtlasIcon src="/atlas-ui/icon-qr-light-17.svg" size={34} />
            {heading}
          </div>
        </>
      }
      panel={
        <>
          <section className={SHEET}>
            <button type="button" onClick={() => router.push(empty.action.href)} className={SOLID_BUTTON}>
              {empty.action.label}
            </button>
          </section>
          <AtlasBottomBar active="scan" />
        </>
      }
    />
  );
}

function StopScanner({ target }: { target: ScanTarget }) {
  const proofs = acceptedProofs(target.checkInMethod);
  const { error, setError, working, checkInWithCode, checkInByLocation } = useStopCheckIn({ stopId: target.stopId, placeName: target.name });
  const { state, restart, torch } = useQrCamera({
    regionId: SCAN_REGION,
    autoStart: proofs.qr,
    onDecode: (text) => void checkInWithCode(text),
  });
  const busy = working !== null;
  const paused = proofs.qr && state === "paused" && !busy;
  const cameraProblem = state in CAMERA_PROBLEM_COPY;

  const scanAgain = () => {
    setError(null);
    restart();
  };

  const heading = (
    <>
      <p className={EYEBROW}>Checking in at</p>
      <h1 className={TITLE}>{target.name}</h1>
      <p className={SUB}>
        {proofs.qr ? "Point your camera at the Atlas code at the counter" : "This stop is confirmed by your location when you arrive"}
      </p>
    </>
  );

  return (
    <CameraLayout
      camera={
        <LiveCamera regionId={SCAN_REGION} heading={heading} closeTo="MyPlan" state={state} torch={torch} busy={working === "qr"} showViewfinder={proofs.qr} />
      }
      panel={
        <>
          <div className="hidden flex-col items-center gap-[4px] bg-atlas-teal px-[24px] py-[20px] text-center wide:flex">{heading}</div>
          <section className={SHEET}>
            {error ? <ErrorNote>{error}</ErrorNote> : null}
            {paused || (proofs.qr && cameraProblem) ? (
              <button type="button" onClick={scanAgain} className={SOLID_BUTTON}>
                {cameraProblem ? "Try the camera again" : "Scan again"}
              </button>
            ) : null}
            {proofs.gps ? (
              <button type="button" disabled={busy} onClick={checkInByLocation} className={proofs.qr ? OUTLINE_BUTTON : SOLID_BUTTON}>
                {working === "gps" ? "Checking your location…" : "Check in with my location"}
              </button>
            ) : null}
            {proofs.qr ? <TypedCode disabled={busy} onSubmit={(code) => void checkInWithCode(code)} /> : null}
          </section>
          <AtlasBottomBar active="scan" />
        </>
      }
    />
  );
}

const HOTEL_REGION = "atlas-hotel-scan-region";

/** ScanHotel · Join your hotel: read the hotel's code and open its landing, where the guest confirms the stay. */
export function HotelScanScreen() {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const open = (scanned: string) => {
    const token = extractQrToken(scanned);
    if (!token) return;
    setOpening(true);
    router.push(`/checkin/${encodeURIComponent(token)}`);
  };
  const { state, restart, torch } = useQrCamera({ regionId: HOTEL_REGION, onDecode: open });
  const cameraProblem = state in CAMERA_PROBLEM_COPY;

  const heading = (
    <>
      <p className={EYEBROW}>Join your hotel</p>
      <h1 className={TITLE}>Scan the hotel&apos;s Atlas code</h1>
      <p className={SUB}>Find it on the card at reception or in your room.</p>
    </>
  );

  return (
    <CameraLayout
      camera={<LiveCamera regionId={HOTEL_REGION} heading={heading} closeTo="NoStay" state={state} torch={torch} busy={opening} showViewfinder />}
      panel={
        <>
          <div className="hidden flex-col items-center gap-[4px] bg-atlas-teal px-[24px] py-[20px] text-center wide:flex">{heading}</div>
          <section className={`${SHEET} pb-[calc(16px+env(safe-area-inset-bottom))]`}>
            <h2 className="font-grotesk text-[17px] font-bold leading-[22px] text-atlas-teal">Can&apos;t scan the code?</h2>
            {cameraProblem ? (
              <button type="button" onClick={restart} className={SOLID_BUTTON}>
                Try the camera again
              </button>
            ) : null}
            <TypedCode disabled={opening} onSubmit={open} />
            <p className="w-full font-manrope text-[13px] leading-[1.5] text-atlas-slate">Or ask the front desk to confirm your stay.</p>
          </section>
        </>
      }
    />
  );
}

export function ScanProblemScreen({ problem }: { problem: ScanProblem }) {
  return (
    <CameraLayout
      label="[Camera placeholder, paused]"
      labelTop={200}
      camera={
        <>
          <CloseButton />
          <AtlasLink
            to={problem.next}
            className="absolute right-[16px] top-[calc(16px+env(safe-area-inset-top))] z-10 flex min-h-[44px] max-w-[calc(100%-92px)] items-center justify-center rounded-[22px] border border-dashed border-atlas-beige bg-atlas-ink/75 px-[14px] py-[4px] text-center font-manrope text-[12px] leading-[16px] text-atlas-paper"
          >
            Design review: case {problem.caseNumber} of 6 ›
          </AtlasLink>
        </>
      }
      panel={
        <section
          role="alertdialog"
          aria-labelledby="scan-problem-title"
          aria-describedby="scan-problem-body"
          className="flex w-full flex-col items-start gap-[14px] rounded-t-[24px] bg-atlas-paper px-[20px] pb-[calc(28px+env(safe-area-inset-bottom))] pt-[24px] wide:rounded-none"
        >
          <span className="flex size-[56px] items-center justify-center rounded-[28px] bg-atlas-sand">
            <AtlasIcon src={problem.icon} size={26} />
          </span>
          <h1 id="scan-problem-title" className="w-full font-grotesk text-[22px] font-bold leading-[25px] text-atlas-teal">
            {problem.title}
          </h1>
          <p id="scan-problem-body" className="w-full font-manrope text-[15px] leading-[23px] text-atlas-ink">
            {problem.body}
          </p>
          <AtlasButton to={problem.primary.to}>{problem.primary.label}</AtlasButton>
          <AtlasTextLink to={problem.secondary.to}>{problem.secondary.label}</AtlasTextLink>
        </section>
      }
    />
  );
}
