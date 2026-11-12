"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, type ReactNode } from "react";
import { deleteAccountAction } from "@/features/users/actions";
import { PendingSubmit } from "./pending-submit";
import { AtlasIcon } from "./asset";
import { AtlasDialog } from "./dialog";
import { DemoAction } from "./navigation";
import { screenHref, type ScreenKey } from "./screen-hrefs";
import Link from "next/link";
import { DATA_WE_STORE, LEGAL_PENDING_NOTE, LOCATION_USE, TERMS_SUMMARY } from "@/features/legal/copy";
import type { FrontDesk } from "@/features/legal/front-desk";
import { FrontDeskCall } from "./front-desk";
import { hotelLabel } from "@/features/legal/stay-hotel";
import { AtlasBackButton, AtlasPoints, AtlasTextLink } from "./ui";

/*
 * Privacy (1:1303), PrivacyPublic (1:2888) and PrivacyDelete (1:1357). The signed-in screen adds
 * Help, the Data request row (1:178) and the delete button; PrivacyDelete is the same screen with
 * the delete confirmation open. The document rows jump to the interim texts at the bottom of
 * the page (src/features/legal/copy.ts); approved legal text is still owed by the owner.
 *
 * Data download and account deletion are for a signed-in guest only: a signed-out visitor is asked
 * to sign in instead, and the hotel is named only from the signed-in guest's own valid stay.
 *
 * Calling the hotel is a real tel: link when the guest's valid stay has a hotel phone number, and a plain
 * "ask at reception" line otherwise. "Download my data" downloads the signed-in guest's own data
 * (GET /api/account/export). Emailing support says it is not connected yet. "Delete account" is real: it
 * deletes the signed-in account and its data on the server (deleteAccountAction), then signs out.
 */

const ROW = "flex min-h-[48px] w-full items-center justify-between gap-[8px] text-left";
const ROW_LABEL = "font-manrope text-[15px] leading-[20px] text-atlas-ink";
const HEADING = "font-grotesk text-[16px] font-bold leading-[20px] text-atlas-teal";

function Chevron() {
  return <AtlasIcon src="/atlas-ui/icon-chevron.svg" size={16} className="shrink-0" />;
}

function AnchorRow({ label, href, divider = true }: { label: string; href: string; divider?: boolean }) {
  return (
    <a href={href} className={`${ROW} ${divider ? "border-b border-atlas-beige" : ""}`}>
      <span className={ROW_LABEL}>{label}</span>
      <Chevron />
    </a>
  );
}

/**
 * A plain link to the signed-in guest's own data; the server decides whose data it is from the session. The file is
 * saved because the response says `attachment`; no `download` attribute, so a refusal (signed out, too many requests)
 * opens as a readable message instead of a failed download.
 */
function DataRequestRow() {
  return (
    <a
      href="/api/account/export"
      className="flex min-h-[52px] w-full items-center justify-between gap-[8px] border-b border-atlas-beige text-left"
    >
      <span className={ROW_LABEL}>Download my data</span>
      <Chevron />
    </a>
  );
}

function Section({ title, children, gap = 0 }: { title: string; children: ReactNode; gap?: number }) {
  return (
    <section className="flex w-full flex-col items-start" style={{ gap }}>
      <h2 className={HEADING}>{title}</h2>
      {children}
    </section>
  );
}

function usesFor(hotelName: string | null) {
  return [
    { icon: "/atlas-ui/icon-pin.svg", text: LOCATION_USE },
    { icon: "/atlas-ui/icon-camera-20.svg", text: "Camera: to read codes and show the marker view. Stays on your phone." },
    { icon: "/atlas-ui/icon-home-20.svg", text: `Your stay: so we show what you can do from ${hotelLabel(hotelName)}.` },
  ];
}

function Documents() {
  const body = "font-manrope text-[14px] leading-[19px] text-atlas-slate";
  return (
    <>
      <div id="terms" className="flex w-full scroll-mt-[16px] flex-col items-start gap-[6px]">
        <h2 className={HEADING}>Terms of use</h2>
        <p className={body}>{TERMS_SUMMARY}</p>
        <p className={body}>{LEGAL_PENDING_NOTE}</p>
      </div>
      <div id="privacy-notice" className="flex w-full scroll-mt-[16px] flex-col items-start gap-[6px]">
        <h2 className={HEADING}>Privacy notice</h2>
        <p className={body}>What Atlas stores about you:</p>
        <ul className={`${body} w-full list-disc space-y-[4px] pl-[20px] [overflow-wrap:anywhere]`}>
          {DATA_WE_STORE.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className={body}>{LEGAL_PENDING_NOTE}</p>
      </div>
    </>
  );
}

function SignInPrompt({ callbackPath }: { callbackPath: string }) {
  return (
    <Section title="Your data" gap={6}>
      <p className="font-manrope text-[14px] leading-[19px] text-atlas-slate">
        Sign in to download your data or delete your account.
      </p>
      <Link
        href={`/login?callbackUrl=${encodeURIComponent(callbackPath)}`}
        className="flex min-h-[44px] items-center font-manrope text-[15px] font-semibold leading-[20px] text-atlas-teal underline underline-offset-2"
      >
        Sign in
      </Link>
    </Section>
  );
}

function Screen({ back, children }: { back: ScreenKey; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[640px] flex-col items-start gap-[18px] bg-atlas-paper px-[16px] pb-[calc(28px+env(safe-area-inset-bottom))] pt-[calc(16px+env(safe-area-inset-top))]">
      <AtlasBackButton to={back} />
      {children}
    </main>
  );
}

export function PrivacyScreen({
  signedIn,
  hotelName,
  frontDesk,
  confirmDelete = false,
}: {
  signedIn: boolean;
  hotelName: string | null;
  /** The valid stay's callable hotel, or null: then a plain "ask at reception" line, never a dead button. */
  frontDesk: FrontDesk | null;
  confirmDelete?: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(confirmDelete && signedIn);
  // Deletes the signed-in account on the server, then signs out to /account-deleted.
  const [deleteState, deleteAction] = useActionState(deleteAccountAction, {});

  const close = () => {
    setConfirming(false);
    const href = screenHref("Privacy");
    if (confirmDelete && href) router.replace(href);
  };

  return (
    <>
      <Screen back={signedIn ? "Stay" : "SignIn"}>
        <h1 className="font-grotesk text-[24px] font-bold leading-[31px] text-atlas-teal">Help and privacy</h1>
        <Section title="Help">
          {signedIn ? (
            <div className="flex w-full flex-col border-b border-atlas-beige">
              <FrontDeskCall
                frontDesk={frontDesk}
                className={ROW}
                fallbackClassName="flex min-h-[48px] items-center font-manrope text-[15px] leading-[20px] text-atlas-slate"
              >
                {frontDesk ? (
                  <>
                    <span className={ROW_LABEL}>Call {frontDesk.hotelName}</span>
                    <Chevron />
                  </>
                ) : null}
              </FrontDeskCall>
            </div>
          ) : null}
          <div className="flex w-full flex-col">
            <DemoAction className={ROW} notice="A support email address isn't available yet." noticeClassName="mb-[8px]">
              <span className={ROW_LABEL}>Email Atlas support</span>
              <Chevron />
            </DemoAction>
          </div>
        </Section>
        <Section title="What Atlas uses" gap={10}>
          <AtlasPoints items={usesFor(signedIn ? hotelName : null)} gap={10} />
        </Section>
        {signedIn ? (
          <>
            <Section title="Your data">
              <DataRequestRow />
              <AnchorRow label="Terms of use" href="#terms" />
              <AnchorRow label="Full privacy notice" href="#privacy-notice" divider={false} />
            </Section>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex h-[48px] w-full items-center justify-center rounded-[12px] border border-atlas-danger font-manrope text-[15px] font-semibold leading-[20px] text-atlas-danger"
            >
              Delete my account
            </button>
          </>
        ) : (
          <>
            <SignInPrompt callbackPath="/privacy" />
            <Section title="Documents">
              <AnchorRow label="Terms of use" href="#terms" />
              <AnchorRow label="Full privacy notice" href="#privacy-notice" divider={false} />
            </Section>
          </>
        )}
        <Documents />
      </Screen>

      <AtlasDialog open={confirming && signedIn} onClose={close} labelledBy="delete-title" describedBy="delete-body">
        <h2 id="delete-title" className="font-grotesk text-[20px] font-bold leading-[26px] text-atlas-ink">
          Delete your Atlas account?
        </h2>
        <>
            <p id="delete-body" className="w-full font-manrope text-[15px] leading-[23px] text-atlas-ink">
              Your plans and achievements will be removed. This cannot be undone. Your hotel booking is not affected.
            </p>
            <form action={deleteAction} className="flex w-full flex-col gap-[8px]">
              {deleteState.error ? (
                <p role="alert" className="w-full rounded-[10px] bg-atlas-sand px-[10px] py-[8px] font-manrope text-[14px] leading-[20px] text-atlas-ink">
                  {deleteState.error}
                </p>
              ) : null}
              <PendingSubmit
                pendingLabel="Deleting…"
                className="flex h-[52px] w-full items-center justify-center rounded-[14px] bg-atlas-danger font-manrope text-[16px] font-semibold leading-[22px] text-white"
              >
                Delete account
              </PendingSubmit>
            </form>
            <AtlasTextLink onClick={close}>Keep my account</AtlasTextLink>
        </>
      </AtlasDialog>
    </>
  );
}

export function PrivacyPublicScreen({ hotelName }: { hotelName: string | null }) {
  return (
    <Screen back="SignIn">
      <h1 className="font-grotesk text-[24px] font-bold leading-[31px] text-atlas-teal">Terms and privacy</h1>
      <Section title="What Atlas uses" gap={10}>
        <AtlasPoints items={usesFor(hotelName)} gap={10} />
      </Section>
      <Section title="Documents">
        <AnchorRow label="Terms of use" href="#terms" />
        <AnchorRow label="Full privacy notice" href="#privacy-notice" divider={false} />
      </Section>
      <Documents />
    </Screen>
  );
}
