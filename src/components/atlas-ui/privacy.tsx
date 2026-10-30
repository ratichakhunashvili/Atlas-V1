"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AtlasIcon } from "./asset";
import { resetDemo } from "./demo/demo-store";
import { AtlasDialog } from "./dialog";
import { DemoAction, FRONT_DESK_NOTICE } from "./navigation";
import { screenHref, type ScreenKey } from "./screen-hrefs";
import { AtlasBackButton, AtlasPoints, AtlasTextLink } from "./ui";

/*
 * Privacy (1:1303), PrivacyPublic (1:2888) and PrivacyDelete (1:1357). The signed-in screen adds
 * Help, the Data request row (1:178) and the delete button; PrivacyDelete is the same screen with
 * the delete confirmation open. The document rows jump to the placeholder texts at the bottom of
 * the page, which stay placeholders until approved terms and a privacy notice exist.
 *
 * Nothing here talks to a server: there are no accounts in this prototype. Calling, emailing and
 * data requests say they are not connected; "Delete account" resets this browser's demo data —
 * the only data there is — and says so.
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

function DataRequestRow() {
  const [requested, setRequested] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setRequested(true)}
      aria-describedby={requested ? "data-request-status" : undefined}
      className="flex min-h-[52px] w-full items-center justify-between gap-[8px] border-b border-atlas-beige text-left"
    >
      <span className={ROW_LABEL}>Download my data</span>
      <span id="data-request-status" role="status" className="text-right font-manrope text-[14px] leading-[19px] text-atlas-slate">
        {requested ? "Prototype · nothing was requested" : "›"}
      </span>
    </button>
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

const USES = [
  { icon: "/atlas-ui/icon-pin.svg", text: "Location: to show walk times and confirm check-ins. Sent only when you check in." },
  { icon: "/atlas-ui/icon-camera-20.svg", text: "Camera: to read codes and show the marker view. Stays on your phone." },
  { icon: "/atlas-ui/icon-home-20.svg", text: "Your stay: so we only show what Hotel A offers and approves." },
];

function Documents() {
  return (
    <>
      <div id="terms" className="flex w-full scroll-mt-[16px] flex-col items-start gap-[6px]">
        <h2 className={HEADING}>Terms of use</h2>
        <p className="font-manrope text-[14px] leading-[19px] text-atlas-slate">[Approved terms text]</p>
      </div>
      <div id="privacy-notice" className="flex w-full scroll-mt-[16px] flex-col items-start gap-[6px]">
        <h2 className={HEADING}>Privacy notice</h2>
        <p className="font-manrope text-[14px] leading-[19px] text-atlas-slate">[Approved privacy notice text]</p>
      </div>
    </>
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

export function PrivacyScreen({ confirmDelete = false }: { confirmDelete?: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(confirmDelete);

  const close = () => {
    setConfirming(false);
    const href = screenHref("Privacy");
    if (confirmDelete && href) router.replace(href);
  };

  return (
    <>
      <Screen back="Stay">
        <h1 className="font-grotesk text-[24px] font-bold leading-[31px] text-atlas-teal">Help and privacy</h1>
        <Section title="Help">
          <div className="flex w-full flex-col border-b border-atlas-beige">
            <DemoAction className={ROW} notice={FRONT_DESK_NOTICE} noticeClassName="mb-[8px]">
              <span className={ROW_LABEL}>Call Hotel A front desk</span>
              <Chevron />
            </DemoAction>
          </div>
          <div className="flex w-full flex-col">
            <DemoAction className={ROW} notice="Support email isn't set up in this prototype." noticeClassName="mb-[8px]">
              <span className={ROW_LABEL}>Email Atlas support</span>
              <span className="flex items-center gap-[4px]">
                <span className="font-manrope text-[13px] leading-[18px] text-atlas-slate">[support email]</span>
                <Chevron />
              </span>
            </DemoAction>
          </div>
        </Section>
        <Section title="What Atlas uses" gap={10}>
          <AtlasPoints items={USES} gap={10} />
        </Section>
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
        <Documents />
      </Screen>

      <AtlasDialog open={confirming} onClose={close} labelledBy="delete-title" describedBy="delete-body">
        <h2 id="delete-title" className="font-grotesk text-[20px] font-bold leading-[26px] text-atlas-ink">
          Delete your Atlas account?
        </h2>
        <>
            <p id="delete-body" className="w-full font-manrope text-[15px] leading-[23px] text-atlas-ink">
              Your plans and achievements will be removed. This cannot be undone. Your hotel booking is not affected.
            </p>
            <button
              type="button"
              onClick={() => {
                resetDemo();
                const href = screenHref("AccountDeleted");
                if (href) router.push(href);
              }}
              className="flex h-[52px] w-full items-center justify-center rounded-[14px] bg-atlas-danger font-manrope text-[16px] font-semibold leading-[22px] text-white"
            >
              Delete account
            </button>
            <AtlasTextLink onClick={close}>Keep my account</AtlasTextLink>
        </>
      </AtlasDialog>
    </>
  );
}

export function PrivacyPublicScreen() {
  return (
    <Screen back="SignIn">
      <h1 className="font-grotesk text-[24px] font-bold leading-[31px] text-atlas-teal">Terms and privacy</h1>
      <Section title="What Atlas uses" gap={10}>
        <AtlasPoints items={USES} gap={10} />
      </Section>
      <Section title="Documents">
        <AnchorRow label="Terms of use" href="#terms" />
        <AnchorRow label="Full privacy notice" href="#privacy-notice" divider={false} />
      </Section>
      <Documents />
    </Screen>
  );
}
